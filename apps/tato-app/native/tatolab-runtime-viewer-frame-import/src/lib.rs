//! Tato Studio's reader of one runtime viewer: it takes the reserved subscriber slot of the channel
//! `open_viewer` answered, reads the latest message the port's node wrote, and for an Image message
//! claims and imports the pooled frame it names, handing Electron's `sharedTexture` what it imports
//! from (DMA-BUF planes on Linux, an IOSurface on macOS). A frame stays claimed against the runtime's
//! reuse until `releaseHeldImageFrame` names it. Every other family's message comes with what its
//! descriptor states: a Channels block's layout, a Packets unit's codec, an Array frame's attribute
//! table, and a Records message decoded to JSON.

use std::collections::BTreeMap;
use std::sync::Arc;

use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Error, Result, Task};
use napi_derive::napi;
use parking_lot::Mutex;
use streamlib_gpu_frame_import_client::{GpuPoolFrameHeldByAViewer, GpuPoolFrameImporterOfAViewer};
use streamlib_ipc_types::{
    ArrayFrameAttributeResidency, ArrayFrameDescriptorBody, ChannelsBlockDescriptorBody,
    ChannelsBlockSampleType, DataChannelPayloadDescriptorKind, ImageFrameDescriptorBody,
    MessageGroupBoundary, MessageReadFromAReservedSlot, OutputPortViewerReader,
    PacketsUnitDescriptorBody, array_frame_attribute_table_of,
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
    /// Linux: Electron's `nativePixmap.modifier` for the planes, the DRM format modifier the runtime
    /// states for them, in decimal.
    pub dma_buf_modifier: Option<String>,
    /// Linux: the first plane's bytes, copied, for memory that crossed as OPAQUE_FD.
    pub cpu_read_bytes: Option<Buffer>,
    /// macOS: the frame's `IOSurfaceRef`, as the pointer bytes Electron's `handle.ioSurface` takes.
    pub io_surface: Option<Buffer>,
}

/// A Channels block's layout, as its descriptor states it; the payload holds `channelCount` runs
/// of `samplesPerChannel` samples, channel by channel.
#[napi(object)]
#[derive(Clone)]
pub struct RuntimeViewerChannelsBlock {
    /// The index, counted from the stream's first sample, of the block's first sample.
    pub start_sample: f64,
    pub sample_rate: u32,
    pub channel_count: u32,
    pub samples_per_channel: u32,
    /// `f32` or `f64`, or `null` for a sample type this build does not know.
    pub sample_type: Option<String>,
}

/// One row of an Array frame's attribute table.
#[napi(object)]
#[derive(Clone)]
pub struct RuntimeViewerArrayAttribute {
    pub name: String,
    /// The element type's wire name, such as `float32`.
    pub dtype: String,
    /// The dimensions, outermost first.
    pub shape: Vec<f64>,
    /// `cpu` for data in the payload, `gpu` for data in a GPU pool slot.
    pub residency: String,
    /// A CPU attribute's data offset into the payload.
    pub payload_byte_offset: Option<f64>,
    /// A CPU attribute's data length.
    pub byte_len: Option<f64>,
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
    /// Whether the message opens a group: a Packets unit's keyframe flag.
    pub starts_group: bool,
    /// A Channels message's block layout.
    pub channels_block: Option<RuntimeViewerChannelsBlock>,
    /// A Packets message's codec name, empty for a plain byte stream.
    pub packets_codec: Option<String>,
    /// An Array message's attribute table.
    pub array_attributes: Option<Vec<RuntimeViewerArrayAttribute>>,
    /// A Records message decoded from its msgpack to JSON text.
    pub records_json: Option<String>,
    /// Why the message's descriptor or payload did not read as its family states.
    pub unreadable_because: Option<String>,
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
    /// importing Image frames from `surfaceShareAddress` (`null` reads every family but Image). On
    /// Linux `viewedFrameReadBy` asks the runtime for each frame as DMA-BUF planes the display imports
    /// (`display_import`) or as rows the CPU reads (`cpu_read`); macOS always hands an IOSurface.
    #[napi(constructor)]
    pub fn new(
        iceoryx2_domain_root: String,
        channel: String,
        surface_share_address: Option<String>,
        viewer_node_name: String,
        viewed_frame_read_by: String,
    ) -> Result<Self> {
        let gpu_pool_frame_importer_for = gpu_pool_frame_importer_reading_by(&viewed_frame_read_by)?;
        let output_port_viewer_reader = OutputPortViewerReader::subscribe(
            std::path::Path::new(&iceoryx2_domain_root),
            &channel,
            &viewer_node_name,
        )
        .map_err(|refusal| Error::from_reason(format!("the viewer could not subscribe to {channel}: {refusal:?}")))?;
        Ok(Self {
            reader_state: Arc::new(Mutex::new(Some(RuntimeViewerReaderState {
                output_port_viewer_reader,
                gpu_pool_frame_importer: surface_share_address.map(gpu_pool_frame_importer_for),
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

/// What makes the importer of a surface-sharing address for a viewer whose frames are read by
/// `viewed_frame_read_by_wire_name`, or why that reading is not one the runtime offers.
#[cfg(target_os = "linux")]
fn gpu_pool_frame_importer_reading_by(
    viewed_frame_read_by_wire_name: &str,
) -> Result<impl FnOnce(String) -> GpuPoolFrameImporterOfAViewer> {
    let viewed_frame_read_by = streamlib_surface_client::ViewedFrameReadBy::from_wire_name(viewed_frame_read_by_wire_name)
        .ok_or_else(|| {
            Error::from_reason(format!(
                "a viewer's frames are read by display_import or cpu_read, not {viewed_frame_read_by_wire_name:?}"
            ))
        })?;
    Ok(move |surface_share_address: String| GpuPoolFrameImporterOfAViewer::new(surface_share_address, viewed_frame_read_by))
}

/// What makes the importer of a surface-sharing address: every macOS frame crosses as an IOSurface,
/// whatever reading the caller names.
#[cfg(target_os = "macos")]
fn gpu_pool_frame_importer_reading_by(
    _viewed_frame_read_by_wire_name: &str,
) -> Result<impl FnOnce(String) -> GpuPoolFrameImporterOfAViewer> {
    Ok(|surface_share_address: String| GpuPoolFrameImporterOfAViewer::new(surface_share_address))
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
    starts_group: bool,
    family_reading: FamilyReadingOfAMessage,
}

/// What a message's descriptor states for its family, beside its payload.
#[derive(Default)]
pub struct FamilyReadingOfAMessage {
    channels_block: Option<RuntimeViewerChannelsBlock>,
    packets_codec: Option<String>,
    array_attributes: Option<Vec<RuntimeViewerArrayAttribute>>,
    records_json: Option<String>,
    unreadable_because: Option<String>,
}

pub struct ImageFrameReadOffTheEventLoop {
    held_frame_id: u32,
    width: u32,
    height: u32,
    format_wire_name: String,
    bytes_per_row: u64,
    dma_buf_planes: Option<Vec<RuntimeViewerDmaBufPlane>>,
    dma_buf_drm_format_modifier: Option<u64>,
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
            starts_group: message.starts_group,
            channels_block: message.family_reading.channels_block,
            packets_codec: message.family_reading.packets_codec,
            array_attributes: message.family_reading.array_attributes,
            records_json: message.family_reading.records_json,
            unreadable_because: message.family_reading.unreadable_because,
            image_frame: message.image_frame.map(|image_frame| RuntimeViewerImageFrame {
                held_frame_id: image_frame.held_frame_id,
                width: image_frame.width,
                height: image_frame.height,
                electron_pixel_format: electron_pixel_format_of(&image_frame.format_wire_name).map(str::to_owned),
                format_wire_name: image_frame.format_wire_name,
                bytes_per_row: saturating_u32(image_frame.bytes_per_row),
                dma_buf_modifier: image_frame.dma_buf_drm_format_modifier.map(|modifier| modifier.to_string()),
                dma_buf_planes: image_frame.dma_buf_planes,
                cpu_read_bytes: image_frame.cpu_read_bytes.map(Buffer::from),
                io_surface: image_frame
                    .io_surface_pointer
                    .map(|pointer| Buffer::from(pointer.to_ne_bytes().to_vec())),
            }),
        }))
    }
}

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
    let family_reading = family_reading_of(descriptor_kind, &message.payload_descriptor.body, &message.payload);
    Ok(ViewerMessageReadOffTheEventLoop {
        port_family,
        timestamp_ns: message.timestamp_ns,
        skipped_since_last_read: message.lost_since_last_read,
        payload: image_frame.is_none().then_some(message.payload),
        image_frame,
        starts_group: message.group_boundary == MessageGroupBoundary::StartsGroup,
        family_reading,
    })
}

/// What the descriptor of a message of `descriptor_kind` states beside `payload`.
fn family_reading_of(
    descriptor_kind: Option<DataChannelPayloadDescriptorKind>,
    descriptor_body: &[u8; streamlib_ipc_types::DATA_CHANNEL_PAYLOAD_DESCRIPTOR_BODY_BYTES],
    payload: &[u8],
) -> FamilyReadingOfAMessage {
    match descriptor_kind {
        Some(DataChannelPayloadDescriptorKind::ChannelsBlock) => {
            let block = ChannelsBlockDescriptorBody::from_descriptor_body(descriptor_body);
            let sample_type = ChannelsBlockSampleType::from_wire(block.sample_type);
            let unreadable_because = match (sample_type, block.planar_payload_byte_len()) {
                (None, _) => Some(format!("the block's sample type {} is not one this Viewer knows", block.sample_type)),
                (Some(_), Some(expected)) if expected == payload.len() => None,
                (Some(_), _) => Some(format!(
                    "the block states {} channels of {} samples, which its {}-byte payload does not hold",
                    block.channel_count,
                    block.samples_per_channel,
                    payload.len()
                )),
            };
            FamilyReadingOfAMessage {
                channels_block: Some(RuntimeViewerChannelsBlock {
                    start_sample: block.start_sample as f64,
                    sample_rate: block.sample_rate,
                    channel_count: block.channel_count,
                    samples_per_channel: block.samples_per_channel,
                    sample_type: sample_type.map(|sample_type| match sample_type {
                        ChannelsBlockSampleType::F32 => "f32".to_owned(),
                        ChannelsBlockSampleType::F64 => "f64".to_owned(),
                    }),
                }),
                unreadable_because,
                ..FamilyReadingOfAMessage::default()
            }
        }
        Some(DataChannelPayloadDescriptorKind::PacketsUnit) => FamilyReadingOfAMessage {
            packets_codec: Some(PacketsUnitDescriptorBody::from_descriptor_body(descriptor_body).codec),
            ..FamilyReadingOfAMessage::default()
        },
        Some(DataChannelPayloadDescriptorKind::ArrayFrame) => {
            match array_frame_attribute_table_of(ArrayFrameDescriptorBody::from_descriptor_body(descriptor_body), payload) {
                Ok(attribute_rows) => FamilyReadingOfAMessage {
                    array_attributes: Some(
                        attribute_rows
                            .into_iter()
                            .map(|row| {
                                let (residency, payload_byte_offset, byte_len) = match row.residency {
                                    ArrayFrameAttributeResidency::Cpu { payload_byte_offset, byte_len } => {
                                        ("cpu", Some(payload_byte_offset as f64), Some(byte_len as f64))
                                    }
                                    ArrayFrameAttributeResidency::GpuPoolSlot(_) => ("gpu", None, None),
                                };
                                RuntimeViewerArrayAttribute {
                                    name: row.name,
                                    dtype: row.dtype,
                                    shape: row.shape.into_iter().map(|dimension| dimension as f64).collect(),
                                    residency: residency.to_owned(),
                                    payload_byte_offset,
                                    byte_len,
                                }
                            })
                            .collect(),
                    ),
                    ..FamilyReadingOfAMessage::default()
                },
                Err(refusal) => FamilyReadingOfAMessage {
                    unreadable_because: Some(refusal.to_string()),
                    ..FamilyReadingOfAMessage::default()
                },
            }
        }
        Some(DataChannelPayloadDescriptorKind::RecordsMessage) => match records_json_of(payload) {
            Ok(records_json) => FamilyReadingOfAMessage { records_json: Some(records_json), ..FamilyReadingOfAMessage::default() },
            Err(unreadable_because) => FamilyReadingOfAMessage {
                unreadable_because: Some(unreadable_because),
                ..FamilyReadingOfAMessage::default()
            },
        },
        _ => FamilyReadingOfAMessage::default(),
    }
}

/// A Records payload, the runtime's msgpack encoding of one keyed map, as JSON text.
fn records_json_of(payload: &[u8]) -> std::result::Result<String, String> {
    let record: serde_json::Value = rmp_serde::from_slice(payload)
        .map_err(|refusal| format!("the record's msgpack did not decode: {refusal}"))?;
    serde_json::to_string(&record).map_err(|refusal| format!("the record did not encode as JSON: {refusal}"))
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
    let (dma_buf_planes, dma_buf_drm_format_modifier, cpu_read_bytes, io_surface_pointer) = {
        use std::os::fd::AsRawFd as _;
        match (pool_slot.dma_buf_planes(), pool_slot.dma_buf_drm_format_modifier()) {
            (Some(planes), Some(drm_format_modifier)) => {
                let planes = planes
                    .iter()
                    .map(|plane| RuntimeViewerDmaBufPlane {
                        fd: plane.fd.as_raw_fd(),
                        offset: saturating_u32(plane.offset),
                        stride: saturating_u32(plane.stride),
                        size: saturating_u32(plane.size),
                    })
                    .collect();
                (Some(planes), Some(drm_format_modifier), None, None::<usize>)
            }
            _ => {
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
                (None, None, Some(bytes.to_vec()), None::<usize>)
            }
        }
    };

    #[cfg(target_os = "macos")]
    let (dma_buf_planes, dma_buf_drm_format_modifier, cpu_read_bytes, io_surface_pointer) = {
        let io_surface: &objc2_io_surface::IOSurfaceRef = pool_slot.iosurface();
        (None::<Vec<RuntimeViewerDmaBufPlane>>, None::<u64>, None::<Vec<u8>>, Some(std::ptr::from_ref(io_surface) as usize))
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
        dma_buf_drm_format_modifier,
        cpu_read_bytes,
        io_surface_pointer,
    })
}

#[cfg(test)]
mod tests {
    use super::{electron_pixel_format_of, family_reading_of, records_json_of};
    use streamlib_ipc_types::{
        ChannelsBlockDescriptorBody, DataChannelPayloadDescriptorKind, PacketsUnitDescriptorBody,
    };

    #[test]
    fn a_records_payload_reads_as_the_json_of_its_keyed_map() {
        let payload = rmp_serde::to_vec_named(&serde_json::json!({"label": "face", "score": 0.5})).unwrap();
        assert_eq!(records_json_of(&payload).unwrap(), r#"{"label":"face","score":0.5}"#);
        assert!(records_json_of(&[0xc1]).unwrap_err().contains("did not decode"));
    }

    #[test]
    fn a_channels_block_reads_its_layout_and_refuses_a_payload_too_short_for_it() {
        let body = ChannelsBlockDescriptorBody {
            start_sample: 96,
            sample_rate: 48_000,
            channel_count: 2,
            samples_per_channel: 2,
            sample_type: 0,
        }
        .to_descriptor_body();
        let reading = family_reading_of(Some(DataChannelPayloadDescriptorKind::ChannelsBlock), &body, &[0; 16]);
        let block = reading.channels_block.unwrap();
        assert_eq!((block.start_sample, block.sample_rate, block.channel_count, block.sample_type.as_deref()), (96.0, 48_000, 2, Some("f32")));
        assert!(reading.unreadable_because.is_none());
        let short = family_reading_of(Some(DataChannelPayloadDescriptorKind::ChannelsBlock), &body, &[0; 8]);
        assert!(short.unreadable_because.unwrap().contains("8-byte payload"));
    }

    #[test]
    fn a_packets_unit_reads_its_codec() {
        let body = PacketsUnitDescriptorBody { codec: "avc1.64001f".to_owned() }.to_descriptor_body().unwrap();
        let reading = family_reading_of(Some(DataChannelPayloadDescriptorKind::PacketsUnit), &body, &[1, 2, 3]);
        assert_eq!(reading.packets_codec.as_deref(), Some("avc1.64001f"));
    }

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
