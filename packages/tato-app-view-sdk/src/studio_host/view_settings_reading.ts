// What a view's area saved, an earlier run's file, checked against the settings the view declares
// before the view is handed it.

import { Result, Schema } from "effect";
import type { TatolabViewManifest } from "../tatolab_view_manifest.js";
import { defaultViewSettingsOf, type ViewSettings, type ViewSettingsReading } from "../view_settings.js";
import { jsonValueSchema } from "./studio_reading_schemas.js";
import { settingsCheckOfTheDeclaration } from "./tatolab_view_manifest_reading.js";

const decodeSettingsObject = Schema.decodeUnknownResult(Schema.Record(Schema.String, jsonValueSchema));

/** `settings` checked against `manifest`'s `settings`; a property left out takes its default. */
export function readViewSettings(manifest: TatolabViewManifest, settings: unknown): ViewSettingsReading {
  if (manifest.settings === undefined) {
    return settings === null || settings === undefined ? { kind: "fit", settings: null } : { kind: "do_not_fit", because: "The view declares no settings." };
  }
  const settingsCheck = settingsCheckOfTheDeclaration(manifest.settings);
  if (settingsCheck.kind === "not_a_schema") return { kind: "do_not_fit", because: settingsCheck.because };
  const checked = settingsCheck.check(settings ?? {});
  if (checked.kind === "does_not_fit") {
    return { kind: "do_not_fit", because: checked.issues.map(({ path, words }) => `\`${path.map(String).join(".") || "settings"}\`: ${words}.`).join(" ") };
  }
  const settingsObject = decodeSettingsObject(checked.settings);
  return Result.isSuccess(settingsObject) ? { kind: "fit", settings: { ...defaultViewSettingsOf(manifest), ...settingsObject.success } } : { kind: "do_not_fit", because: "Settings are an object of JSON values." };
}

/** The settings an area opens a view on: what it saved, when that still fits, or else the view's defaults. */
export function viewSettingsForAnArea(manifest: TatolabViewManifest, savedSettings: unknown): ViewSettings {
  if (savedSettings === undefined) return defaultViewSettingsOf(manifest);
  const reading = readViewSettings(manifest, savedSettings);
  return reading.kind === "fit" ? reading.settings : defaultViewSettingsOf(manifest);
}
