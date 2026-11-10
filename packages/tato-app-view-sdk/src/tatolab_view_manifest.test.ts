import { describe, expect, it } from "vitest";
import { readTatolabViewManifest } from "./tatolab_view_manifest.js";

const STAGE_RIG_MANIFEST = {
  contract: "1.0",
  title: "Stage rig",
  description: "Fixtures on a stage, with a master fader.",
  icon: "icon.svg",
  preview: "preview.png",
  entry: "index.html",
  placement: "node",
  accepts: { files: [".mvr", ".gdtf"] },
  inputs: [{ name: "fixtures", family: "records", description: "Each fixture and where it hangs." }],
  outputs: [{ name: "master_intensity", family: "array", range: [0, 1] }],
  settings: { type: "object", properties: { show_beams: { type: "boolean", default: true } } },
  capabilities: ["read.selection", "read.project_assets", "camera", "microphone"],
};

function becauseOf(manifestJson: unknown): string {
  const reading = readTatolabViewManifest(manifestJson);
  return reading.kind === "not_read" ? reading.because : "it was read";
}

describe("readTatolabViewManifest", () => {
  it("reads every field a view declares", () => {
    expect(readTatolabViewManifest(STAGE_RIG_MANIFEST)).toEqual({ kind: "read", manifest: STAGE_RIG_MANIFEST });
  });

  it("fills in what an area view leaves out: no ports, no files and no capabilities", () => {
    expect(readTatolabViewManifest({ contract: "1.0", title: "Notes", entry: "dist/index.html", placement: "area" })).toEqual({
      kind: "read",
      manifest: {
        contract: "1.0",
        title: "Notes",
        entry: "dist/index.html",
        placement: "area",
        inputs: [],
        outputs: [],
        accepts: { files: [] },
        capabilities: [],
      },
    });
  });

  it("refuses a view built for a later minor or another major, naming the contract served", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, contract: "1.4" })).toBe("`contract`: this Tato Studio serves view contract 1.0.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, contract: "2.0" })).toBe("`contract`: this Tato Studio serves view contract 1.0.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, contract: 1 })).toContain("`contract`:");
  });

  it("refuses an entry, icon or preview that reaches outside the view's folder", () => {
    for (const entry of ["../window/index.html", "/index.html", "https://example.com/index.html", "a//b.html", "a\\b.html"]) {
      expect(becauseOf({ ...STAGE_RIG_MANIFEST, entry })).toBe("`entry`: it is a path inside the view's folder, with no `..` step, scheme or backslash.");
    }
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, icon: "../../icon.svg" })).toContain("`icon`:");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, preview: "/preview.png" })).toContain("`preview`:");
  });

  it("refuses a field the contract does not have, so a misspelt one is never silently ignored", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, capabilites: [] })).toBe('`tatolab_view.json`: Unrecognized key: "capabilites".');
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, view_type_id: "acme:stage-rig" })).toContain('Unrecognized key: "view_type_id"');
  });

  it("refuses a sandbox or network hosts, which the contract does not have: every view runs with full access", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, sandbox: true })).toBe('`tatolab_view.json`: Unrecognized key: "sandbox".');
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, network: ["fixtures.example.com"] })).toBe('`tatolab_view.json`: Unrecognized key: "network".');
  });

  it("refuses a port of no known family, a name out of shape, a name given twice, or a range on a port that is not Array", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "level", family: "numbers" }] })).toContain("`outputs[0].family`:");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, inputs: [{ name: "Deck A", family: "channels" }] })).toBe(
      "`inputs[0].name`: a port name is lower-case letters, digits and underscores.",
    );
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, inputs: [{ name: "deck", family: "channels" }, { name: "deck", family: "image" }] })).toBe("`inputs[1].name`: `deck` is named twice.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "level", family: "image", range: [0, 1] }] })).toBe("`outputs[0].range`: only an Array port carries a range.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "level", family: "array", range: [1, 0] }] })).toBe("`outputs[0].range`: a range is [lowest, highest], lowest first.");
  });

  it("refuses ports on an area view, which has no node to carry them", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, placement: "area" })).toContain("`placement`: an `area` view has no node");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, placement: "dock" })).toContain("`placement`:");
  });

  it("refuses a capability the contract does not have, and keeps one asked for twice once", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, capabilities: ["read.everything"] })).toContain("`capabilities[0]`:");
    const reading = readTatolabViewManifest({ ...STAGE_RIG_MANIFEST, capabilities: ["gpu", "gpu"] });
    expect(reading.kind === "read" ? reading.manifest.capabilities : null).toEqual(["gpu"]);
  });

  it("refuses an extension without its dot", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, accepts: { files: ["glb"] } })).toBe('`accepts.files[0]`: an extension is lower case with its dot, as ".glb".');
  });

  it("refuses settings whose properties give no default", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, settings: { type: "object", properties: { show_beams: { type: "boolean" } } } })).toContain("`settings.properties.show_beams.default`:");
    expect(
      becauseOf({ ...STAGE_RIG_MANIFEST, settings: { type: "object", properties: { show_beams: { type: "boolean", default: "yes" } } } }),
    ).toContain("`settings.properties.show_beams.default`: its default does not fit its own schema");
  });

  it("refuses a manifest that is not an object or has no title", () => {
    expect(becauseOf([])).toContain("`tatolab_view.json`:");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, title: " " })).toBe("`title`: it is the name the view-type menu lists.");
  });
});
