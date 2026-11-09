import { describe, expect, it } from "vitest";
import { readTatolabViewManifest, type TatolabViewManifest } from "./tatolab_view_manifest.js";
import { defaultViewSettingsOf, readViewSettings, viewSettingsForAnArea } from "./view_settings.js";

function manifestWithSettings(settings: unknown): TatolabViewManifest {
  const reading = readTatolabViewManifest({ contract: "1.0", title: "Code", entry: "index.html", placement: "area", settings });
  if (reading.kind === "not_read") throw new Error(reading.because);
  return reading.manifest;
}

const CODE_SETTINGS = manifestWithSettings({
  type: "object",
  additionalProperties: false,
  properties: {
    open_files: { type: "array", items: { type: "string" }, default: [] },
    shown_file: { type: ["string", "null"], default: null },
    logs_shown: { type: "boolean", default: true },
    logs_size_percent: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 100, default: 30 },
    row_expansion: { type: "object", additionalProperties: { type: "boolean" }, default: {} },
  },
});

describe("view settings", () => {
  it("starts a new area on every declared default", () => {
    expect(defaultViewSettingsOf(CODE_SETTINGS)).toEqual({ open_files: [], shown_file: null, logs_shown: true, logs_size_percent: 30, row_expansion: {} });
  });

  it("keeps saved settings that fit, a property left out taking its default", () => {
    expect(readViewSettings(CODE_SETTINGS, { open_files: ["/p/main.py"], shown_file: "/p/main.py" })).toEqual({
      kind: "fit",
      settings: { open_files: ["/p/main.py"], shown_file: "/p/main.py", logs_shown: true, logs_size_percent: 30, row_expansion: {} },
    });
  });

  it("refuses settings that do not fit, naming the setting", () => {
    const reading = readViewSettings(CODE_SETTINGS, { logs_size_percent: 140 });
    expect(reading.kind === "do_not_fit" ? reading.because : "").toContain("`logs_size_percent`");
    expect(readViewSettings(CODE_SETTINGS, { surprise: 1 }).kind).toBe("do_not_fit");
  });

  it("opens an area on its defaults when what it saved no longer fits", () => {
    expect(viewSettingsForAnArea(CODE_SETTINGS, { open_files: "not a list" })).toEqual(defaultViewSettingsOf(CODE_SETTINGS));
    expect(viewSettingsForAnArea(CODE_SETTINGS, undefined)).toEqual(defaultViewSettingsOf(CODE_SETTINGS));
  });

  it("holds null for a view that declares no settings", () => {
    const manifest = manifestWithSettings(undefined);
    expect(defaultViewSettingsOf(manifest)).toBeNull();
    expect(readViewSettings(manifest, { anything: 1 }).kind).toBe("do_not_fit");
  });
});
