// What a view's area remembers: the manifest's `settings` declares it as JSON Schema with a default
// for every property, and Studio checks an area's saved settings against it before handing them
// to the view.

import { z } from "zod";
import type { JsonValue } from "./studio_readings.js";
import { settingsSchemaOfTheDeclaration, type TatolabViewManifest } from "./tatolab_view_manifest.js";

/** The settings a view holds: an object of JSON values, or `null` for a view that declares none. */
export type ViewSettings = { [settingName: string]: JsonValue } | null;

/** The settings a new area of the view starts with: each declared property's default, or `null` when it declares none. */
export function defaultViewSettingsOf(manifest: TatolabViewManifest): ViewSettings {
  if (manifest.settings === undefined) return null;
  return Object.fromEntries(Object.entries(manifest.settings.properties).map(([settingName, property]) => [settingName, property.default]));
}

/** Settings checked against what the view declares, or why they do not fit, in words naming the setting. */
export type ViewSettingsReading = { kind: "fit"; settings: ViewSettings } | { kind: "do_not_fit"; because: string };

/** `settings` checked against `manifest`'s `settings`; a property left out takes its default. */
export function readViewSettings(manifest: TatolabViewManifest, settings: unknown): ViewSettingsReading {
  if (manifest.settings === undefined) {
    return settings === null || settings === undefined ? { kind: "fit", settings: null } : { kind: "do_not_fit", because: "The view declares no settings." };
  }
  const declaredSettings = settingsSchemaOfTheDeclaration(manifest.settings);
  if (declaredSettings.kind === "not_a_schema") return { kind: "do_not_fit", because: declaredSettings.because };
  const parsed = declaredSettings.schema.safeParse(settings ?? {});
  if (!parsed.success) {
    return { kind: "do_not_fit", because: parsed.error.issues.map((issue) => `\`${issue.path.map(String).join(".") || "settings"}\`: ${issue.message}.`).join(" ") };
  }
  const defaults = defaultViewSettingsOf(manifest);
  const checked = z.record(z.string(), z.json()).safeParse(parsed.data);
  return checked.success ? { kind: "fit", settings: { ...defaults, ...checked.data } } : { kind: "do_not_fit", because: "Settings are an object of JSON values." };
}

/** The settings an area opens a view on: what it saved, when that still fits, or else the view's defaults. */
export function viewSettingsForAnArea(manifest: TatolabViewManifest, savedSettings: unknown): ViewSettings {
  if (savedSettings === undefined) return defaultViewSettingsOf(manifest);
  const reading = readViewSettings(manifest, savedSettings);
  return reading.kind === "fit" ? reading.settings : defaultViewSettingsOf(manifest);
}
