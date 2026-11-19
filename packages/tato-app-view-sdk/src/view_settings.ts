// What a view's area remembers: the manifest's `settings` declares it as JSON Schema with a default
// for every property, and Studio checks an area's saved settings against it, on its own side, before
// handing them to the view.

import type { JsonValue } from "./studio_readings.js";
import type { TatolabViewManifest } from "./tatolab_view_manifest.js";

/** The settings a view holds: an object of JSON values, or `null` for a view that declares none. */
export type ViewSettings = { [settingName: string]: JsonValue } | null;

/** The settings a new area of the view starts with: each declared property's default, or `null` when it declares none. */
export function defaultViewSettingsOf(manifest: TatolabViewManifest): ViewSettings {
  if (manifest.settings === undefined) return null;
  return Object.fromEntries(Object.entries(manifest.settings.properties).map(([settingName, property]) => [settingName, property.default]));
}

/** Settings checked against what the view declares, or why they do not fit, in words naming the setting. */
export type ViewSettingsReading = { kind: "fit"; settings: ViewSettings } | { kind: "do_not_fit"; because: string };
