//! Tato Studio's reader of one runtime viewer: it takes the reserved subscriber slot of the channel
//! `open_viewer` answered, reads the latest message the port's node wrote, and for an Image message
//! claims and imports the pooled frame it names, handing Electron's `sharedTexture` what it imports
//! from (DMA-BUF planes on Linux, an IOSurface on macOS). A frame stays claimed against the runtime's
//! reuse until `releaseHeldImageFrame` names it.

use std::collections::BTreeMap;
use std::sync::Arc;

use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Error, Result, Task};
use napi_derive::napi;
use parking_lot::Mutex;
use streamlib_gpu_frame_import_client::{GpuPoolFrameHeldByAViewer, GpuPoolFrameImporterOfAViewer};
use streamlib_ipc_types::{
    DataChannelPayloadDescriptorKind, ImageFrameDescriptorBody, MessageReadFromAReservedSlot,
    OutputPortViewerReader,
};

/// One plane of a DMA-BUF frame, as Electron's `nativePixmap.planes[]` takes it.
#[napi(object)]
pub struct RuntimeViewerDmaBufPlane {
    /// The plane's file descriptor, valid until the frame is released.
    pub fd: i32,
    pub stride: u32,
    pub offset: u32,
    pub size: u32,
}

/// An Image frame the reader holds claimed, with what Electron imports it from.
#[napi(object)]
pub struct RuntimeViewerImageFrame {
    /// The id `releaseHeldImageFrame` takes.
    pub held_frame_id: u32,
    pub width: u32,
    pub height: u32,
    /// The runtime's wire name of the pixel format (`"bgra32"`, `"rgba32"`, `"nv12"`, …).
    pub format_wire_name: String,
    /// Electron's `pixelFormat` for the format, or `null` when Electron cannot import it.
    pub electron_pixel_format: Option<String>,
    /// The first plane's row pitch, padding included.
    pub bytes_per_row: u32,
    /// Linux: each plane's DMA-BUF, first plane first; `null` when the memory crossed as OPAQUE_FD.
    pub dma_buf_planes: Option<Vec<RuntimeViewerDmaBufPlane>>,
    /// Linux: Electron's `nativePixmap.modifier` for the planes, a pool slot being linear memory.
    pub dma_buf_modifier: Option<String>,
    /// Linux: the first plane's bytes, copied, for memory that crossed as OPAQUE_FD.
    pub cpu_read_bytes: Option<Buffer>,
    /// macOS: the frame's `IOSurfaceRef`, as the pointer bytes Electron's `handle.ioSurface` takes.
    pub io_surface: Option<Buffer>,
}

/// The latest message a viewer read from the port.
#[napi(object)]
pub struct RuntimeViewerMessageRead {
    /// The port family the message's descriptor names: `image`, `channels`, `packets`, `records`,
    /// `array`, or `bytes` for a payload no family describes.
    pub port_family: String,
    /// The node's publish stamp, in nanoseconds of its stream's clock.
    pub timestamp_ns: i64,
    /// Messages the viewer skipped since its previous read, because it reads only the latest.
    pub skipped_since_last_read: f64,
    /// The Image frame, for an Image message.
    pub image_frame: Option<RuntimeViewerImageFrame>,
    /// The payload as the node wrote it, for every family but Image.
    pub payload: Option<Buffer>,
}

struct RuntimeViewerReaderState {
    output_port_viewer_reader: OutputPortViewerReader,
    gpu_pool_frame_importer: Option<GpuPoolFrameImporterOfAViewer>,
    held_image_frames_by_id: BTreeMap<u32, GpuPoolFrameHeldByAViewer>,
    next_held_frame_id: u32,
    #[cfg(target_os = "linux")]
    cpu_read_vulkan_device: Option<Arc<streamlib_consumer_rhi::ConsumerVulkanDevice>>,
}

/// A reader of one viewer's channel, opened from what `open_viewer` answered.
#[napi]
pub struct RuntimeViewerChannelReader {
    reader_state: Arc<Mutex<Option<RuntimeViewerReaderState>>>,
}

#[napi]
impl RuntimeViewerChannelReader {
    /// Subscribe to `channel` in the iceoryx2 domain at `iceoryx2DomainRoot` as `viewerNodeName`,
    /// importing Image frames from `surfaceShareAddress` (`null` reads every family but Image).
    #[napi(constructor)]
    pub fn new(
        iceoryx2_domain_root: String,
        channel: String,
        surface_share_address: Option<String>,
        viewer_node_name: String,
    ) -> Result<Self> {
        let output_port_viewer_reader = OutputPortViewerReader::subscribe(
            std::path::Path::new(&iceoryx2_domain_root),
            &channel,
            &viewer_node_name,
        )
        .map_err(|refusal| Error::from_reason(format!("the viewer could not subscribe to {channel}: {refusal:?}")))?;
        Ok(Self {
            reader_state: Arc::new(Mutex::new(Some(RuntimeViewerReaderState {
                output_port_viewer_reader,
                gpu_pool_frame_importer: surface_share_address.map(GpuPoolFrameImporterOfAViewer::new),
                held_image_frames_by_id: BTreeMap::new(),
                next_held_frame_id: 1,
                #[cfg(target_os = "linux")]
                cpu_read_vulkan_device: None,
            }))),
        })
    }

    /// The latest message the port's node wrote since the previous read, or `null` when none came;
    /// read off the event loop, because a pool slot's first import waits on the runtime.
    #[napi(ts_return_type = "Promise<RuntimeViewerMessageRead | null>")]
    pub fn read_latest_message(&self) -> AsyncTask<ReadTheLatestViewerMessage> {
        AsyncTask::new(ReadTheLatestViewerMessage { reader_state: Arc::clone(&self.reader_state) })
    }

    /// Release the frame `heldFrameId` so the runtime may reuse its pool slot; a frame already
    /// released is ignored.
    #[napi]
    pub fn release_held_image_frame(&self, held_frame_id: u32) {
        if let Some(reader_state) = self.reader_state.lock().as_mut() {
            reader_state.held_image_frames_by_id.remove(&held_frame_id);
        }
    }

    /// Release every held frame and the channel's reserved slot.
    #[napi]
    pub fn close(&self) {
        self.reader_state.lock().take();
    }
}

/// One `readLatestMessage`, run on libuv's thread pool.
pub struct ReadTheLatestViewerMessage {
    reader_state: Arc<Mutex<Option<RuntimeViewerReaderState>>>,
}

/// What a read found, before it becomes JavaScript values.
pub struct ViewerMessageReadOffTheEventLoop {
    port_family: &'static str,
    timestamp_ns: i64,
    skipped_since_last_read: u64,
    image_frame: Option<ImageFrameReadOffTheEventLoop>,
    payload: Option<Vec<u8>>,
}

pub struct ImageFrameReadOffTheEventLoop {
    held_frame_id: u32,
    width: u32,
    height: u32,
    format_wire_name: String,
    bytes_per_row: u64,
    dma_buf_planes: Option<Vec<(i32, u64)>>,
    cpu_read_bytes: Option<Vec<u8>>,
    io_surface_pointer: Option<usize>,
}

impl Task for ReadTheLatestViewerMessage {
    type Output = Option<ViewerMessageReadOffTheEventLoop>;
    type JsValue = Option<RuntimeViewerMessageRead>;

    fn compute(&mut self) -> Result<Self::Output> {
        let mut reader_state_guard = self.reader_state.lock();
        let Some(reader_state) = reader_state_guard.as_mut() else {
            return Err(Error::from_reason("the viewer's channel reader is closed"));
        };
        let Some(message) = reader_state
            .output_port_viewer_reader
            .read_the_latest_message()
            .map_err(Error::from_reason)?
        else {
            return Ok(None);
        };
        read_the_message(reader_state, message).map(Some)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output.map(|message| RuntimeViewerMessageRead {
            port_family: message.port_family.to_owned(),
            timestamp_ns: message.timestamp_ns,
            skipped_since_last_read: message.skipped_since_last_read as f64,
            payload: message.payload.map(Buffer::from),
            image_frame: message.image_frame.map(|image_frame| RuntimeViewerImageFrame {
                held_frame_id: image_frame.held_frame_id,
                width: image_frame.width,
                height: image_frame.height,
                electron_pixel_format: electron_pixel_format_of(&image_frame.format_wire_name).map(str::to_owned),
                format_wire_name: image_frame.format_wire_name,
                bytes_per_row: saturating_u32(image_frame.bytes_per_row),
                dma_buf_modifier: image_frame.dma_buf_planes.as_ref().map(|_| DRM_FORMAT_MOD_LINEAR.to_owned()),
                dma_buf_planes: image_frame.dma_buf_planes.map(|planes| {
                    planes
                        .into_iter()
                        .map(|(fd, size)| RuntimeViewerDmaBufPlane {
                            fd,
                            stride: saturating_u32(image_frame.bytes_per_row),
                            offset: 0,
                            size: saturating_u32(size),
                        })
                        .collect()
                }),
                cpu_read_bytes: image_frame.cpu_read_bytes.map(Buffer::from),
                io_surface: image_frame
                    .io_surface_pointer
                    .map(|pointer| Buffer::from(pointer.to_ne_bytes().to_vec())),
            }),
        }))
    }
}

/// `DRM_FORMAT_MOD_LINEAR`, as Electron's `nativePixmap.modifier` spells it.
const DRM_FORMAT_MOD_LINEAR: &str = "0";

/// Electron's `sharedTexture` pixel format for a runtime wire format it can import: a pixel buffer's
/// format, or a GPU pool slot's texture format.
fn electron_pixel_format_of(format_wire_name: &str) -> Option<&'static str> {
    match format_wire_name {
        "bgra32" | "bgra8_unorm" | "bgra8_unorm_srgb" => Some("bgra"),
        "rgba32" | "rgba8_unorm" | "rgba8_unorm_srgb" => Some("rgba"),
        "rgba16_float" => Some("rgbaf16"),
        "nv12" => Some("nv12"),
        _ => None,
    }
}

fn saturating_u32(value: u64) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

fn port_family_of(descriptor_kind: Option<DataChannelPayloadDescriptorKind>) -> &'static str {
    match descriptor_kind {
        Some(DataChannelPayloadDescriptorKind::ImageFrame | DataChannelPayloadDescriptorKind::GpuPoolSlotFrame) => "image",
        Some(DataChannelPayloadDescriptorKind::ChannelsBlock) => "channels",
        Some(DataChannelPayloadDescriptorKind::PacketsUnit) => "packets",
        Some(DataChannelPayloadDescriptorKind::RecordsMessage) => "records",
        Some(DataChannelPayloadDescriptorKind::ArrayFrame) => "array",
        Some(DataChannelPayloadDescriptorKind::Bytes) | None => "bytes",
    }
}

fn read_the_message(
    reader_state: &mut RuntimeViewerReaderState,
    message: MessageReadFromAReservedSlot,
) -> Result<ViewerMessageReadOffTheEventLoop> {
    let descriptor_kind = message.payload_descriptor.known_kind().ok();
    let port_family = port_family_of(descriptor_kind);
    let image_frame_slot = match descriptor_kind {
        Some(DataChannelPayloadDescriptorKind::ImageFrame) => {
            Some(ImageFrameDescriptorBody::from_descriptor_body(&message.payload_descriptor.body).slot)
        }
        Some(DataChannelPayloadDescriptorKind::GpuPoolSlotFrame) => Some(
            streamlib_ipc_types::GpuPoolSlotFrameDescriptorBody::from_descriptor_body(&message.payload_descriptor.body),
        ),
        _ => None,
    };
    let image_frame = match image_frame_slot {
        Some(slot) => Some(hold_and_describe_the_image_frame(reader_state, slot)?),
        None => None,
    };
    Ok(ViewerMessageReadOffTheEventLoop {
        port_family,
        timestamp_ns: message.timestamp_ns,
        skipped_since_last_read: message.lost_since_last_read,
        payload: image_frame.is_none().then_some(message.payload),
        image_frame,
    })
}

fn hold_and_describe_the_image_frame(
    reader_state: &mut RuntimeViewerReaderState,
    slot: streamlib_ipc_types::GpuPoolSlotFrameDescriptorBody,
) -> Result<ImageFrameReadOffTheEventLoop> {
    let Some(gpu_pool_frame_importer) = reader_state.gpu_pool_frame_importer.as_ref() else {
        return Err(Error::from_reason(
            "the runtime named no surface-sharing address for this viewer, so its Image frames cannot be imported",
        ));
    };
    let held = gpu_pool_frame_importer.hold_the_frame(slot).map_err(Error::from_reason)?;
    let pool_slot = held.pool_slot();
    let width = pool_slot.width();
    let height = pool_slot.height();
    let format_wire_name = pool_slot.format_wire_name().to_owned();
    let bytes_per_row = pool_slot.bytes_per_row();

    #[cfg(target_os = "linux")]
    let (dma_buf_planes, cpu_read_bytes, io_surface_pointer) = {
        use std::os::fd::AsRawFd as _;
        let plane_sizes = pool_slot.plane_sizes().to_vec();
        match pool_slot.dma_buf_plane_fds() {
            Some(plane_fds) => {
                let planes = plane_fds
                    .iter()
                    .zip(plane_sizes.iter().copied().chain(std::iter::repeat(0)))
                    .map(|(plane_fd, plane_size)| (plane_fd.as_raw_fd(), plane_size))
                    .collect();
                (Some(planes), None, None::<usize>)
            }
            None => {
                let cpu_read_vulkan_device = match &reader_state.cpu_read_vulkan_device {
                    Some(device) => Arc::clone(device),
                    None => {
                        let exporting_device_uuid = pool_slot.opaque_fd_exporting_device_uuid().ok_or_else(|| {
                            Error::from_reason("the pool slot's OPAQUE_FD memory names no exporting device")
                        })?;
                        let device = Arc::new(
                            streamlib_consumer_rhi::ConsumerVulkanDevice::new_on_the_device_the_runtime_named(
                                exporting_device_uuid,
                            )
                            .map_err(|refusal| {
                                Error::from_reason(format!("the viewer could not open the runtime's GPU to read the frame: {refusal}"))
                            })?,
                        );
                        reader_state.cpu_read_vulkan_device = Some(Arc::clone(&device));
                        device
                    }
                };
                let bytes = pool_slot.bytes_for_a_cpu_read(&cpu_read_vulkan_device).map_err(Error::from_reason)?;
                (None, Some(bytes.to_vec()), None::<usize>)
            }
        }
    };

    #[cfg(target_os = "macos")]
    let (dma_buf_planes, cpu_read_bytes, io_surface_pointer) = {
        let io_surface: &objc2_io_surface::IOSurfaceRef = pool_slot.iosurface();
        (None::<Vec<(i32, u64)>>, None::<Vec<u8>>, Some(std::ptr::from_ref(io_surface) as usize))
    };

    let held_frame_id = reader_state.next_held_frame_id;
    reader_state.next_held_frame_id = reader_state.next_held_frame_id.wrapping_add(1).max(1);
    reader_state.held_image_frames_by_id.insert(held_frame_id, held);
    Ok(ImageFrameReadOffTheEventLoop {
        held_frame_id,
        width,
        height,
        format_wire_name,
        bytes_per_row,
        dma_buf_planes,
        cpu_read_bytes,
        io_surface_pointer,
    })
}

#[cfg(test)]
mod tests {
    use super::electron_pixel_format_of;

    #[test]
    fn a_pool_slots_texture_format_imports_as_the_electron_format_of_its_byte_order() {
        assert_eq!(electron_pixel_format_of("rgba8_unorm"), Some("rgba"));
        assert_eq!(electron_pixel_format_of("rgba8_unorm_srgb"), Some("rgba"));
        assert_eq!(electron_pixel_format_of("bgra8_unorm"), Some("bgra"));
        assert_eq!(electron_pixel_format_of("rgba16_float"), Some("rgbaf16"));
        assert_eq!(electron_pixel_format_of("bgra32"), Some("bgra"));
        assert_eq!(electron_pixel_format_of("rgba32_float"), None);
    }
}
