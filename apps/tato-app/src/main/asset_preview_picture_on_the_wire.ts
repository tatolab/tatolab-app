// An asset's preview picture as the runtime answers it: `list_assets` sizes it in each entry's `preview`, `{ pixel_width,
// pixel_height, media_type }`, `null` for none; `read_asset_preview` answers the asset's UUID, the same three keys and the
// picture's bytes as `content_base64`, standard base64 with padding, of `byte_len` bytes.

import type { ProjectAssetPreview } from "../shared/tatolab_backend_contract.js";
import { requiredText, requiredUnsignedInteger, toolResultReadWith, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { bytesOfTheBase64Content } from "./project_files_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** An asset's preview picture: its size, its media type and its bytes. */
export interface AssetPreviewPictureTheRuntimeRead {
  readonly pixel_width: number;
  readonly pixel_height: number;
  readonly media_type: string;
  readonly picture_bytes: Buffer;
}

/** The size and media type of a preview picture as `previewObject` states them, or why they are not a picture's. */
export function previewPictureSizeIn(previewObject: JsonObjectOnTheWire): Result<ProjectAssetPreview, string> {
  const pixelWidth = requiredUnsignedInteger(previewObject, "pixel_width");
  if (!pixelWidth.ok) return pixelWidth;
  const pixelHeight = requiredUnsignedInteger(previewObject, "pixel_height");
  if (!pixelHeight.ok) return pixelHeight;
  if (pixelWidth.value === 0 || pixelHeight.value === 0) return failedWith(`the picture is ${pixelWidth.value}×${pixelHeight.value} pixels, an empty one`);
  const mediaType = requiredText(previewObject, "media_type");
  if (!mediaType.ok) return mediaType;
  if (!mediaType.value.startsWith("image/")) return failedWith(`its \`media_type\` is ${mediaType.value}, not an image`);
  return succeeded({ pixel_width: pixelWidth.value, pixel_height: pixelHeight.value, media_type: mediaType.value });
}

/** The picture `read_asset_preview` answered with `operationResult` for `asset`, or why it could not be read. */
export function assetPreviewPictureFromTheReadAssetPreviewToolResult(asset: string, operationResult: unknown): Result<AssetPreviewPictureTheRuntimeRead, string> {
  return toolResultReadWith("read_asset_preview", operationResult, (toolResult) => assetPreviewPictureIn(asset, toolResult));
}

function assetPreviewPictureIn(asset: string, toolResult: JsonObjectOnTheWire): Result<AssetPreviewPictureTheRuntimeRead, string> {
  const answeredAsset = requiredText(toolResult, "asset");
  if (!answeredAsset.ok) return answeredAsset;
  if (answeredAsset.value !== asset) return failedWith(`it answers the asset ${answeredAsset.value}, not ${asset}`);
  const pictureSize = previewPictureSizeIn(toolResult);
  if (!pictureSize.ok) return pictureSize;
  const pictureBytes = bytesOfTheBase64Content(toolResult);
  if (!pictureBytes.ok) return pictureBytes;
  return succeeded({ ...pictureSize.value, picture_bytes: pictureBytes.value });
}
