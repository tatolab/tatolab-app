// A project's assets as the runtime's `list_assets` tool lists them: the project's folder, UUID
// and name beside `assets`, one entry each with its UUID, kind, path, the SHA-256 and length of
// its bytes and its import settings. Every other key is ignored.

import type { JsonValue, ProjectAsset, ProjectAssetListing } from "../shared/tatolab_backend_contract.js";
import { everyOneRead, isAJsonValue, jsonObject, objectOrEmpty, requiredArray, requiredText, requiredUnsignedInteger, toolResultReadWith, type JsonObjectOnTheWire } from "./json_on_the_wire.js";
import { projectNamedIn } from "./project_the_runtime_names.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** The assets `list_assets` answered with `toolResultText`, or why they could not be read. */
export function projectAssetListingFromTheListAssetsToolResult(toolResultText: string): Result<ProjectAssetListing, string> {
  return toolResultReadWith("list_assets", toolResultText, projectAssetListingIn);
}

function projectAssetListingIn(toolResult: JsonObjectOnTheWire): Result<ProjectAssetListing, string> {
  const project = projectNamedIn(toolResult, "project_name");
  if (!project.ok) return project;
  const assetsOnTheWire = requiredArray(toolResult, "assets");
  if (!assetsOnTheWire.ok) return assetsOnTheWire;
  const assets = everyOneRead(assetsOnTheWire.value, projectAssetOnTheWire);
  if (!assets.ok) return assets;
  return succeeded({ project_directory: project.value.folder, project: project.value.project, project_name: project.value.name, assets: assets.value });
}

function projectAssetOnTheWire(assetOnTheWire: unknown): Result<ProjectAsset, string> {
  const assetObject = jsonObject(assetOnTheWire, "an asset");
  if (!assetObject.ok) return assetObject;
  const asset = requiredText(assetObject.value, "asset");
  if (!asset.ok) return asset;
  const kind = requiredText(assetObject.value, "kind");
  if (!kind.ok) return kind;
  const path = requiredText(assetObject.value, "path");
  if (!path.ok) return path;
  const contentSha256 = requiredText(assetObject.value, "content_sha256");
  if (!contentSha256.ok) return contentSha256;
  const contentByteLen = requiredUnsignedInteger(assetObject.value, "content_byte_len");
  if (!contentByteLen.ok) return contentByteLen;
  const importSettings = importSettingsOf(assetObject.value);
  if (!importSettings.ok) return importSettings;
  return succeeded({ asset: asset.value, kind: kind.value, path: path.value, content_sha256: contentSha256.value, content_byte_len: contentByteLen.value, import_settings: importSettings.value });
}

function importSettingsOf(assetObject: JsonObjectOnTheWire): Result<Record<string, JsonValue>, string> {
  const importSettings = objectOrEmpty(assetObject, "import_settings");
  if (!importSettings.ok) return importSettings;
  const settings: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(importSettings.value)) {
    if (!isAJsonValue(value)) return failedWith(`import setting ${key} is not JSON`);
    settings[key] = value;
  }
  return succeeded(settings);
}
