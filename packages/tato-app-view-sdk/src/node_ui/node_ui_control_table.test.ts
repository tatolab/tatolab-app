import { expect, test } from "vitest";
import type { BuiltInPinTypeName } from "../pin_types.js";
import { NodeUiControlTable } from "./node_ui_control_table.js";
import { inputDeclarationOf, listedElementOf, ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME } from "./test_fixtures/node_ui_listing_fixtures.js";

const BUILT_IN_PIN_TYPE_NAMES: readonly BuiltInPinTypeName[] = Object.values(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME).map((pinType) => pinType.type);

test("with no element listed, every built-in pin type's input gets the read-only line with its reason", () => {
  const table = new NodeUiControlTable({ elements: [] });
  expect(BUILT_IN_PIN_TYPE_NAMES).toHaveLength(22);
  for (const name of BUILT_IN_PIN_TYPE_NAMES) {
    const pinType = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME[name];
    const typeWords = pinType.type === "named" ? pinType.named_pin_type : name.replaceAll("_", " ");
    expect(table.controlChoiceForTheInput(inputDeclarationOf(pinType)), name).toEqual({ kind: "read_only_line", because: `No control is registered for an input of type ${typeWords}.` });
  }
});

test("the Studio's default for each built-in pin type draws its inputs, and a default for named types is passed over", () => {
  const defaults = BUILT_IN_PIN_TYPE_NAMES.map((name) => listedElementOf("studio", { kind: "control", type: name, control: null }, { script: `${name}.ts` }));
  const table = new NodeUiControlTable({ elements: defaults });
  for (const name of BUILT_IN_PIN_TYPE_NAMES) {
    const choice = table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME[name]));
    if (name === "named") expect(choice.kind, name).toBe("read_only_line");
    else expect(choice, name).toEqual({ kind: "element", listed: defaults.find((listed) => listed.script === `${name}.ts`), chosen_by: "type_default", because: null });
  }
  expect(table.registrationsPassedOver.map(({ because }) => because)).toEqual([
    "A control is registered for one named type by the import path of its class, so studio's named.ts, registered for named, draws none.",
  ]);
});

test("the control an annotation names wins over the type's default, bare for the Studio's and qualified by its module for a project's", () => {
  const floatDefault = listedElementOf("studio", { kind: "control", type: "float", control: null }, { script: "float_number.ts" });
  const studioSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script: "float_slider.ts" });
  const acmeKnob = listedElementOf("acme", { kind: "control", type: "float", control: "knob" }, { script: "knob.ts" });
  const table = new NodeUiControlTable({ elements: [floatDefault, studioSlider, acmeKnob] });
  const float = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float;
  expect(table.controlChoiceForTheInput(inputDeclarationOf(float, { control: "slider" }))).toEqual({ kind: "element", listed: studioSlider, chosen_by: "annotation", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(float, { control: "acme:knob" }))).toEqual({ kind: "element", listed: acmeKnob, chosen_by: "annotation", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(float, { control: null }))).toEqual({ kind: "element", listed: floatDefault, chosen_by: "type_default", because: null });
});

test("an input that states both ends of its range gets its type's slider, and one with an open end or none gets its type's default", () => {
  const integerDefault = listedElementOf("studio", { kind: "control", type: "integer", control: null }, { script: "integer_stepper.ts" });
  const integerSlider = listedElementOf("studio", { kind: "control", type: "integer", control: "slider" }, { script: "integer_slider.ts" });
  const floatDefault = listedElementOf("studio", { kind: "control", type: "float", control: null }, { script: "float_number.ts" });
  const acmeKnob = listedElementOf("acme", { kind: "control", type: "integer", control: "knob" }, { script: "knob.ts" });
  const table = new NodeUiControlTable({ elements: [integerDefault, integerSlider, floatDefault, acmeKnob] });
  const { integer, float } = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME;
  expect(table.controlChoiceForTheInput(inputDeclarationOf(integer, { range: { minimum: 1, maximum: 16 } }))).toEqual({ kind: "element", listed: integerSlider, chosen_by: "stated_range", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(integer, { range: { minimum: 1 } }))).toEqual({ kind: "element", listed: integerDefault, chosen_by: "type_default", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(integer, { range: { minimum: null, maximum: 16 } }))).toEqual({ kind: "element", listed: integerDefault, chosen_by: "type_default", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(integer, { range: null }))).toEqual({ kind: "element", listed: integerDefault, chosen_by: "type_default", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(float, { range: { minimum: 0, maximum: 1 } }))).toEqual({ kind: "element", listed: floatDefault, chosen_by: "type_default", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(integer, { range: { minimum: 1, maximum: 16 }, control: "acme:knob" }))).toEqual({ kind: "element", listed: acmeKnob, chosen_by: "annotation", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(integer, { range: { minimum: 1, maximum: 16 }, control: "dial" }))).toEqual({
    kind: "element",
    listed: integerSlider,
    chosen_by: "stated_range",
    because: "No control named dial is registered for an input of type integer; its range's slider draws it.",
  });
});

test("a project's control named slider is picked by its qualified name only, never by a stated range", () => {
  const integerDefault = listedElementOf("studio", { kind: "control", type: "integer", control: null });
  const acmeSlider = listedElementOf("acme", { kind: "control", type: "integer", control: "slider" });
  const table = new NodeUiControlTable({ elements: [integerDefault, acmeSlider] });
  const integer = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.integer;
  expect(table.controlChoiceForTheInput(inputDeclarationOf(integer, { range: { minimum: 0, maximum: 10 } }))).toEqual({ kind: "element", listed: integerDefault, chosen_by: "type_default", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(integer, { control: "acme:slider" }))).toEqual({ kind: "element", listed: acmeSlider, chosen_by: "annotation", because: null });
});

test("an annotation that names a control no one registers says so, on the type's default or on the read-only line", () => {
  const floatDefault = listedElementOf("studio", { kind: "control", type: "float", control: null });
  const acmeKnob = listedElementOf("acme", { kind: "control", type: "float", control: "knob" });
  const table = new NodeUiControlTable({ elements: [floatDefault, acmeKnob] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float, { control: "knob" }))).toEqual({
    kind: "element",
    listed: floatDefault,
    chosen_by: "type_default",
    because: "No control named knob is registered for an input of type float; its type's default draws it.",
  });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.integer, { control: "acme:knob" }))).toEqual({
    kind: "read_only_line",
    because: "No control named acme:knob is registered for an input of type integer.",
  });
});

test("a control registered for the bare name named would draw every named type, so the table uses none", () => {
  const spectrumView = listedElementOf("acme", { kind: "control", type: "named", control: "spectrum" });
  const table = new NodeUiControlTable({ elements: [spectrumView] });
  const spectrum = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.named;
  expect(table.controlChoiceForTheInput(inputDeclarationOf(spectrum, { control: "acme:spectrum" }))).toEqual({
    kind: "read_only_line",
    because: "No control named acme:spectrum is registered for an input of type acme:Spectrum.",
  });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(spectrum))).toEqual({ kind: "read_only_line", because: "No control is registered for an input of type acme:Spectrum." });
  expect(table.registrationsPassedOver).toEqual([
    { listed: spectrumView, because: "A control is registered for one named type by the import path of its class, so acme's control.ts, registered for named, draws none." },
  ]);
});

test("only the Studio sets a built-in type's default, and a node body is keyed by its node type, one that passed its checks taking the key from one that did not; each refusal is kept with why", () => {
  const acmeFloatDefault = listedElementOf("acme", { kind: "control", type: "float", control: null });
  const otherCrossfadeBody = listedElementOf("other", { kind: "node_body", node_type: "nodes.crossfade:Crossfade" }, { script_serving: { kind: "blocked", findings: ["node_body_not_the_modules_to_register"], runtime_findings: [] } });
  const acmeCrossfadeBody = listedElementOf("acme", { kind: "node_body", node_type: "nodes.crossfade:Crossfade" }, { script: "crossfade_body.ts" });
  const table = new NodeUiControlTable({ elements: [acmeFloatDefault, otherCrossfadeBody, acmeCrossfadeBody] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float)).kind).toBe("read_only_line");
  expect(table.nodeBodyForTheNodeType("nodes.crossfade:Crossfade")).toBe(acmeCrossfadeBody);
  expect(table.nodeBodyForTheNodeType("nodes.fader:Fader")).toBeNull();
  expect(table.registrationsPassedOver).toEqual([
    { listed: acmeFloatDefault, because: "Only Tato Studio sets the default control of a built-in type; acme registers one for float." },
    { listed: otherCrossfadeBody, because: "acme's crossfade_body.ts, which passed its checks, registers the body of nodes.crossfade:Crossfade." },
  ]);
  expect(table.typeDefaultsPassedOverFor(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float)).toEqual([
    { listed: acmeFloatDefault, because: "Only Tato Studio sets the default control of a built-in type; acme registers one for float." },
  ]);
  expect(table.typeDefaultsPassedOverFor(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.string)).toEqual([]);
});

test("a named type's default from a module that does not declare it, displaced by the declaring module's, is kept under that type", () => {
  const otherSpectrumDefault = listedElementOf("other", { kind: "control", type: "acme:Spectrum", control: null }, { script_serving: { kind: "blocked", findings: ["default_control_not_the_modules_to_register"], runtime_findings: [] } });
  const acmeSpectrumDefault = listedElementOf("acme", { kind: "control", type: "acme:Spectrum", control: null }, { script: "spectrum.ts" });
  const table = new NodeUiControlTable({ elements: [otherSpectrumDefault, acmeSpectrumDefault] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.named))).toMatchObject({ kind: "element", listed: acmeSpectrumDefault, chosen_by: "named_type" });
  expect(table.typeDefaultsPassedOverFor(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.named)).toEqual([
    { listed: otherSpectrumDefault, because: "acme's spectrum.ts, which passed its checks, registers the default control for acme:Spectrum." },
  ]);
});

test("a node body that did not pass its checks is the node type's body while no other is listed, so the card draws its rows", () => {
  const blockedBody = listedElementOf("acme", { kind: "node_body", node_type: "nodes.crossfade:Crossfade" }, { script_serving: { kind: "blocked", findings: ["crossfade_body.ts:3:1 TS2322"], runtime_findings: [] } });
  expect(new NodeUiControlTable({ elements: [blockedBody] }).nodeBodyForTheNodeType("nodes.crossfade:Crossfade")).toBe(blockedBody);
});

test("a second element under a key already taken is passed over with a diagnostic naming the one that holds it", () => {
  const firstSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script: "float_slider.ts" });
  const secondSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script: "float_slider_again.ts" });
  const table = new NodeUiControlTable({ elements: [firstSlider, secondSlider] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float, { control: "slider" }))).toMatchObject({ kind: "element", listed: firstSlider });
  expect(table.registrationsPassedOver).toEqual([{ listed: secondSlider, because: "studio's float_slider.ts already registers the control slider for float." }]);
});

test("the table chooses a blocked element all the same, so loading it ends at the read-only line and never at another control", () => {
  const blockedSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script_serving: { kind: "blocked", findings: ["float_slider.ts:3:1 TS2322"], runtime_findings: [] } });
  const floatDefault = listedElementOf("studio", { kind: "control", type: "float", control: null });
  const table = new NodeUiControlTable({ elements: [blockedSlider, floatDefault] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float, { control: "slider" }))).toEqual({ kind: "element", listed: blockedSlider, chosen_by: "annotation", because: null });
});

test("a named type's input gets the default its declaring module registers, an annotation's control first, and else the read-only line", () => {
  const sweepDefault = listedElementOf("every-pin-kind", { kind: "control", type: "nodes.sweep:Sweep", control: null }, { script: "sweep_on_its_wire.ts" });
  const sweepGauge = listedElementOf("every-pin-kind", { kind: "control", type: "nodes.sweep:Sweep", control: "gauge" }, { script: "sweep_gauge.ts" });
  const table = new NodeUiControlTable({ elements: [sweepDefault, sweepGauge] });
  const sweep = { type: "named", named_pin_type: "nodes.sweep:Sweep" } as const;
  expect(table.controlChoiceForTheInput(inputDeclarationOf(sweep))).toEqual({ kind: "element", listed: sweepDefault, chosen_by: "named_type", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(sweep, { control: "every-pin-kind:gauge" }))).toEqual({ kind: "element", listed: sweepGauge, chosen_by: "annotation", because: null });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(sweep, { control: "dial" }))).toEqual({
    kind: "element",
    listed: sweepDefault,
    chosen_by: "named_type",
    because: "No control named dial is registered for an input of type nodes.sweep:Sweep; its type's default draws it.",
  });
  expect(table.controlChoiceForTheInput(inputDeclarationOf({ type: "named", named_pin_type: "rig.arm:Pose" }))).toEqual({ kind: "read_only_line", because: "No control is registered for an input of type rig.arm:Pose." });
  expect(table.registrationsPassedOver).toEqual([]);
});

test("a named type's default the Studio registers is passed over, and one a served folder registers takes the key from a blocked one", () => {
  const studioSweep = listedElementOf("studio", { kind: "control", type: "nodes.sweep:Sweep", control: null }, { script: "studio_sweep.ts" });
  const blockedSweep = listedElementOf("sweeps", { kind: "control", type: "nodes.sweep:Sweep", control: null }, { script: "sweep.ts", script_serving: { kind: "blocked", findings: ["only the module that declares a named type may register its default"], runtime_findings: [] } });
  const servedSweep = listedElementOf("every-pin-kind", { kind: "control", type: "nodes.sweep:Sweep", control: null }, { script: "sweep_on_its_wire.ts" });
  const table = new NodeUiControlTable({ elements: [studioSweep, blockedSweep, servedSweep] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf({ type: "named", named_pin_type: "nodes.sweep:Sweep" }))).toEqual({ kind: "element", listed: servedSweep, chosen_by: "named_type", because: null });
  expect(table.registrationsPassedOver).toEqual([
    { listed: studioSweep, because: "Only the module that declares a named type sets its default control, and Tato Studio declares none; it registers one for nodes.sweep:Sweep." },
    { listed: blockedSweep, because: "every-pin-kind's sweep_on_its_wire.ts, which passed its checks, registers the default control for nodes.sweep:Sweep." },
  ]);
});
