// An asset's preview picture as the runtime's `read_asset_preview` answers it: the asset's UUID, the
// picture's `pixel_width`, `pixel_height` and `media_type` (`image/png`), and its bytes as
// `content_base64`, standard base64 with padding, of `byte_len` bytes.

import {
  requiredText,
  requiredUnsignedInteger,
  toolResultReadWith,
  type JsonObjectOnTheWire,
} from "./json_on_the_wire.js";
import { bytesOfTheBase64Content } from "./project_files_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** An asset's preview picture: its size, its media type and its bytes. */
export interface AssetPreviewPictureTheRuntimeRead {
  pixel_width: number;
  pixel_height: number;
  media_type: string;
  picture_bytes: Buffer;
}

/** The picture `read_asset_preview` answered with `toolResultText` for `asset`, or why it could not be read. */
export function assetPreviewPictureFromTheReadAssetPreviewToolResult(
  asset: string,
  toolResultText: string,
): Result<AssetPreviewPictureTheRuntimeRead, string> {
  return toolResultReadWith(
    "read_asset_preview",
    toolResultText,
    (toolResult) => assetPreviewPictureIn(asset, toolResult),
  );
}

function assetPreviewPictureIn(
  asset: string,
  toolResult: JsonObjectOnTheWire,
): Result<AssetPreviewPictureTheRuntimeRead, string> {
  const answeredAsset = requiredText(toolResult, "asset");
  if (!answeredAsset.ok) return answeredAsset;
  if (answeredAsset.value !== asset)
    return failedWith(
      `it answers the asset ${answeredAsset.value}, not ${asset}`,
    );
  const pixelWidth = requiredUnsignedInteger(toolResult, "pixel_width");
  if (!pixelWidth.ok) return pixelWidth;
  const pixelHeight = requiredUnsignedInteger(toolResult, "pixel_height");
  if (!pixelHeight.ok) return pixelHeight;
  const mediaType = requiredText(toolResult, "media_type");
  if (!mediaType.ok) return mediaType;
  if (!mediaType.value.startsWith("image/"))
    return failedWith(`its \`media_type\` is ${mediaType.value}, not an image`);
  const pictureBytes = bytesOfTheBase64Content(toolResult);
  if (!pictureBytes.ok) return pictureBytes;
  return succeeded({
    pixel_width: pixelWidth.value,
    pixel_height: pixelHeight.value,
    media_type: mediaType.value,
    picture_bytes: pictureBytes.value,
  });
}
