import { describe, expect, it } from "vitest";
import { readTatolabViewManifest } from "./tatolab_view_manifest_reading.js";

const STAGE_RIG_MANIFEST = {
  contract: "1.1",
  title: "Stage rig",
  description: "Fixtures on a stage, with a master fader.",
  icon: "icon.svg",
  preview: "preview.png",
  entry: "index.html",
  placement: "node",
  accepts: { files: [".mvr", ".gdtf"] },
  inputs: [{ name: "fixtures", pin_type: { type: "string" }, description: "Each fixture and where it hangs." }],
  outputs: [{ name: "master_intensity", pin_type: { type: "tensor" }, range: [0, 1] }],
  settings: { type: "object", properties: { show_beams: { type: "boolean", default: true } } },
  capabilities: ["read.selection", "read.project_assets", "camera", "microphone"],
};

/** `STAGE_RIG_MANIFEST` as read: each port with the family its pin type is carried as. */
const STAGE_RIG_MANIFEST_READ = {
  ...STAGE_RIG_MANIFEST,
  inputs: [{ name: "fixtures", family: "records", pin_type: { type: "string" }, description: "Each fixture and where it hangs." }],
  outputs: [{ name: "master_intensity", family: "array", pin_type: { type: "tensor" }, range: [0, 1] }],
};

function becauseOf(manifestJson: unknown): string {
  const reading = readTatolabViewManifest(manifestJson);
  return reading.kind === "not_read" ? reading.because : "it was read";
}

describe("readTatolabViewManifest", () => {
  it("reads every field a view declares, each port with the family its pin type is carried as", () => {
    expect(readTatolabViewManifest(STAGE_RIG_MANIFEST)).toEqual({ kind: "read", manifest: STAGE_RIG_MANIFEST_READ });
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
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, contract: "1.4" })).toBe("`contract`: this Tato Studio serves view contract 1.1.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, contract: "2.0" })).toBe("`contract`: this Tato Studio serves view contract 1.1.");
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

  it("refuses a name out of shape, a name given twice, or a range on a port that is not Array", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, inputs: [{ name: "Deck A", pin_type: { type: "float" } }] })).toBe(
      "`inputs[0].name`: a port name is lower-case letters, digits and underscores.",
    );
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, inputs: [{ name: "deck", pin_type: { type: "float" } }, { name: "deck", pin_type: { type: "texture" } }] })).toBe("`inputs[1].name`: `deck` is named twice.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "level", pin_type: { type: "texture" }, range: [0, 1] }] })).toBe("`outputs[0].range`: only an Array port carries a range.");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "level", pin_type: { type: "tensor" }, range: [1, 0] }] })).toBe("`outputs[0].range`: a range is [lowest, highest], lowest first.");
  });

  it("refuses an output named after one of its inputs, and an output a panel writes named after one of its settings, since each is one input name on the view node", () => {
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "fixtures", pin_type: { type: "texture" } }] })).toBe("`outputs[0].name`: `fixtures` names an input too, and a port is named once.");
    for (const pinType of [{ type: "tensor" }, { type: "float" }, { type: "string" }]) {
      expect(becauseOf({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "show_beams", pin_type: pinType }] })).toBe(
        "`outputs[0].name`: `show_beams` names a setting too, and the value of an output a panel writes is set on the view node's input of the output's name, so such an output is named after no setting.",
      );
    }
  });

  it("reads an Image or Packets output named after one of its settings, since a panel writes neither and neither has an input", () => {
    for (const pinType of [{ type: "texture" }, { type: "encoded_video" }]) {
      expect(readTatolabViewManifest({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "show_beams", pin_type: pinType }] }).kind).toBe("read");
    }
  });

  it("refuses a port declared by the older family alone, in the runtime's words: the port, the field, and the pin type to write in its place", () => {
    const withOutput = (contract: string, output: unknown) => ({ ...STAGE_RIG_MANIFEST, contract, outputs: [output] });
    expect(becauseOf(withOutput("1.1", { name: "picture", family: "image" }))).toBe(
      '`outputs[0]`: port `picture` is declared by the older `family` field, which a view\'s port no longer names; write `"pin_type": {"type": "texture"}` in place of `"family": "image"`, with `"contract": "1.1"`.',
    );
    expect(becauseOf(withOutput("1.0", { name: "gain", family: "channels" }))).toBe(
      '`outputs[0]`: port `gain` is declared by the older `family` field, which a view\'s port no longer names; a `channels` port carries one of `boolean`, `integer`, `float`, `color`, `vector`, `rectangle`, `transform`, `audio`: write the one it carries as its `pin_type`, as `{"type": "<type>"}`, in place of `"family": "channels"`, with `"contract": "1.1"`.',
    );
    expect(becauseOf(withOutput("1.1", { name: "station", family: "records" }))).toBe(
      '`outputs[0]`: port `station` is declared by the older `family` field, which a view\'s port no longer names; a `records` port carries one of `string`, `menu`, `asset`, `trigger`, or a `bundle` of small members, as a record of named numbers is, written `{"type": "bundle", "members": [{"name": "<name>", "member_type": {"type": "float"}}, ...]}`: write the one it carries as its `pin_type`, as `{"type": "<type>"}`, in place of `"family": "records"`, with `"contract": "1.1"`.',
    );
  });

  it("refuses a port that names no pin type, or the older family beside its pin type, even the family it is carried as", () => {
    const withOutput = (output: unknown) => ({ ...STAGE_RIG_MANIFEST, outputs: [output] });
    expect(becauseOf(withOutput({ name: "level" }))).toBe("`outputs[0]`: port `level` names the `pin_type` it carries.");
    for (const family of ["channels", "records"]) {
      expect(becauseOf(withOutput({ name: "level", family, pin_type: { type: "float" } }))).toBe(
        "`outputs[0]`: port `level` names the older `family` field beside its `pin_type`; drop `family`, which the `pin_type` sets.",
      );
    }
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

  it("reads a 1.1 port by its pin type, the family it is carried as filled in", () => {
    const monitor = { ...STAGE_RIG_MANIFEST, inputs: [{ name: "picture", pin_type: { type: "texture", pixel_formats: ["rgba8_unorm"] } }] };
    expect(readTatolabViewManifest(monitor)).toEqual({
      kind: "read",
      manifest: { ...STAGE_RIG_MANIFEST_READ, inputs: [{ name: "picture", family: "image", pin_type: { type: "texture", pixel_formats: ["rgba8_unorm"] } }] },
    });
  });

  it("still reads a 1.0 view that declares no port", () => {
    expect(readTatolabViewManifest({ contract: "1.0", title: "Notes", entry: "index.html", placement: "area" }).kind).toBe("read");
  });

  it("reads a port of a bundle of small members, or of Lists of them, as Records, which carries it whole as one map of its members by name", () => {
    const camera = { type: "bundle", members: [{ name: "yaw", member_type: { type: "float" } }, { name: "bursts", member_type: { type: "integer" } }] };
    const levels = { type: "bundle", members: [{ name: "label", member_type: { type: "string" } }, { name: "peaks", member_type: { type: "list_of", element_type: { type: "float" } } }] };
    const stage = { ...STAGE_RIG_MANIFEST, inputs: [{ name: "levels", pin_type: levels }], outputs: [{ name: "camera", pin_type: camera }] };
    expect(readTatolabViewManifest(stage)).toEqual({
      kind: "read",
      manifest: { ...stage, inputs: [{ name: "levels", family: "records", pin_type: levels }], outputs: [{ name: "camera", family: "records", pin_type: camera }] },
    });
  });

  it("reads a port of a bundle of only Tensors as Array, which carries it whole as one frame of an attribute for each member", () => {
    const detections = { type: "bundle", members: [{ name: "boxes", member_type: { type: "tensor" } }, { name: "scores", member_type: { type: "tensor" } }] };
    const detector = { ...STAGE_RIG_MANIFEST, inputs: [{ name: "detections", pin_type: detections }] };
    expect(readTatolabViewManifest(detector)).toEqual({ kind: "read", manifest: { ...STAGE_RIG_MANIFEST_READ, inputs: [{ name: "detections", family: "array", pin_type: detections }] } });
  });

  it("refuses a port of a bundle holding a Texture, Audio or encoded member, which travels as a Bundle frame no family carries", () => {
    const withOutput = (members: unknown) => ({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "framed", pin_type: { type: "bundle", members } }] });
    const refusal = "`outputs[0]`: `pin_type`: a bundle rides no message a view's port reads or writes; a view declares a port of a type a link carries.";
    expect(becauseOf(withOutput([{ name: "label", member_type: { type: "string" } }, { name: "picture", member_type: { type: "texture" } }]))).toBe(refusal);
    expect(becauseOf(withOutput([{ name: "level", member_type: { type: "float" } }, { name: "sound", member_type: { type: "audio" } }]))).toBe(refusal);
    expect(becauseOf(withOutput([{ name: "frame", member_type: { type: "integer" } }, { name: "clip", member_type: { type: "encoded_video" } }]))).toBe(refusal);
  });

  it("refuses a bundle the runtime refuses in the contract's words, as one mixing a Tensor with a member of another type", () => {
    const withOutput = (members: unknown) => ({ ...STAGE_RIG_MANIFEST, outputs: [{ name: "framed", pin_type: { type: "bundle", members } }] });
    expect(becauseOf(withOutput([{ name: "weights", member_type: { type: "tensor" } }, { name: "clip", member_type: { type: "encoded_video" } }]))).toBe(
      "`outputs[0].pin_type.members`: matches none of the 2 alternatives the contract allows here.",
    );
  });

  it("refuses a pin type the contract does not take at its field, and an output a panel writes of a type that holds no value", () => {
    const withOutput = (output: unknown) => ({ ...STAGE_RIG_MANIFEST, outputs: [output] });
    expect(becauseOf(withOutput({ name: "level", pin_type: { type: "float", exact_size: "float16" } }))).toContain("`outputs[0].pin_type");
    expect(becauseOf(withOutput({ name: "level", pin_type: { type: "decibels" } }))).toContain("`outputs[0].pin_type.type`: a pin type's `type` is one of `boolean`, ");
    expect(becauseOf(withOutput({ name: "fire", pin_type: { type: "trigger" } }))).toBe("`outputs[0].pin_type`: a panel writes a value onto a Records output, and a trigger holds none.");
    expect(readTatolabViewManifest(withOutput({ name: "level", pin_type: { type: "audio" } })).kind).toBe("read");
  });

  it("refuses a manifest that is not an object or has no title", () => {
    expect(becauseOf([])).toContain("`tatolab_view.json`:");
    expect(becauseOf({ ...STAGE_RIG_MANIFEST, title: " " })).toBe("`title`: it is the name the view-type menu lists.");
  });
});
