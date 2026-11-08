import { describe, expect, it } from "vitest";
import type { JsonValue } from "./tatolab_backend_contract.js";
import { readStudioViewManifest } from "./studio_view_manifest.js";

const STAGE_RIG_MANIFEST: { [key: string]: JsonValue } = {
  contract: "1.0",
  title: "Stage rig",
  icon: "icon.svg",
  entry: "index.html",
  accepts: { files: [".mvr", ".gdtf"] },
  inputs: [{ name: "fixtures", family: "records", fields: ["fixture_id", "position"] }],
  outputs: [{ name: "master_intensity", family: "array", range: [0, 1] }],
  capabilities: ["read.selection", "read.project_assets"],
  network: ["fixtures.example.com", "localhost:8080"],
};

function becauseOf(manifestJson: JsonValue): string {
  const reading = readStudioViewManifest(manifestJson);
  return reading.kind === "not_read" ? reading.because : "it was read";
}

describe("readStudioViewManifest", () => {
  it("reads every field a view declares, keeping each port's name and family", () => {
    expect(readStudioViewManifest(STAGE_RIG_MANIFEST)).toEqual({
      kind: "read",
      manifest: {
        contract: { major: 1, minor: 0 },
        title: "Stage rig",
        icon_path: "icon.svg",
        entry_path: "index.html",
        accepts_file_extensions: [".mvr", ".gdtf"],
        inputs: [{ name: "fixtures", family: "records" }],
        outputs: [{ name: "master_intensity", family: "array" }],
        capabilities: ["read.selection", "read.project_assets"],
        network_hosts: ["fixtures.example.com", "localhost:8080"],
      },
    });
  });

  it("reads a view declaring only its contract, title and entry as one with no ports, capabilities or hosts", () => {
    expect(readStudioViewManifest({ contract: "1.0", title: "Notes", entry: "dist/index.html" })).toEqual({
      kind: "read",
      manifest: {
        contract: { major: 1, minor: 0 },
        title: "Notes",
        icon_path: null,
        entry_path: "dist/index.html",
        accepts_file_extensions: [],
        inputs: [],
        outputs: [],
        capabilities: [],
        network_hosts: [],
      },
    });
  });

  it("refuses a view built for a later minor or another major, naming both versions", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, contract: "1.4" })).toBe("It was built for view contract 1.4, and this Tato Studio serves 1.0.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, contract: "2.0" })).toBe("It was built for view contract 2.0, and this Tato Studio serves 1.0.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, contract: 1 })).toContain("`contract` is 1");
  });

  it("refuses an entry or icon that reaches outside the view's folder", () => {
    for (const entry of ["../window/index.html", "/index.html", "https://example.com/index.html", "a//b.html", "a\\b.html"]) {
      expect(becauseOf({ ...STAGE_RIG_MANIFEST, entry })).toContain("`entry` is");
    }
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, icon: "../../icon.svg" })).toContain("`icon` is");
  });

  it("refuses a capability the contract does not have, and keeps one asked for twice once", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, capabilities: ["read.everything"] })).toBe("It asks for `read.everything`, which view contract 1.0 does not have.");
    const reading = readStudioViewManifest({ ...STAGE_RIG_MANIFEST, capabilities: ["gpu", "gpu"] });
    expect(reading.kind === "read" ? reading.manifest.capabilities : null).toEqual(["gpu"]);
  });

  it("refuses a port of no known family, a name out of shape, or a name given twice", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "level", family: "numbers" }] })).toBe(
      '`level` carries "numbers"; a port carries one of image, array, channels, packets, records.',
    );
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, inputs: [{ name: "Deck A", family: "channels" }] })).toContain('a port named "Deck A"');
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, inputs: [{ name: "deck", family: "channels" }, { name: "deck", family: "image" }] })).toBe("`inputs` names `deck` twice.");
  });

  it("refuses a network host with a scheme or wildcard, and an extension without its dot", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, network: ["https://fixtures.example.com"] })).toContain('`network` lists "https://fixtures.example.com"');
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, network: ["*.example.com"] })).toContain('`network` lists "*.example.com"');
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, accepts: { files: ["glb"] } })).toContain('`accepts.files` lists "glb"');
  });

  it("refuses a manifest that is not an object or has no title", () => {
    expect(becauseOf([])).toBe("`tatolab_view.json` is not a JSON object.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, title: " " })).toContain("`title` is missing");
  });
});
