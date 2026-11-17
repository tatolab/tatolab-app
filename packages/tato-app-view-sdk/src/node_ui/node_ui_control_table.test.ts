import { expect, test } from "vitest";
import type { BuiltInPinTypeName } from "../pin_types.js";
import { NodeUiControlTable } from "./node_ui_control_table.js";
import { inputDeclarationOf, listedElementOf, ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME } from "./test_fixtures/node_ui_listing_fixtures.js";

const BUILT_IN_PIN_TYPE_NAMES: readonly BuiltInPinTypeName[] = Object.values(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME).map((pinType) => pinType.type);

test("with no element listed, every built-in pin type's input gets the read-only line with its reason", () => {
  const table = new NodeUiControlTable({ elements: [] });
  expect(BUILT_IN_PIN_TYPE_NAMES).toHaveLength(21);
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
  expect(table.registrationsPassedOver.map(({ because }) => because)).toEqual(["A control cannot be registered for one named type, so studio's named.ts draws none."]);
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

test("a control registered for named would draw every named type, so the table uses none and a named input ends at the read-only line", () => {
  const spectrumView = listedElementOf("acme", { kind: "control", type: "named", control: "spectrum" });
  const table = new NodeUiControlTable({ elements: [spectrumView] });
  const spectrum = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.named;
  expect(table.controlChoiceForTheInput(inputDeclarationOf(spectrum, { control: "acme:spectrum" }))).toEqual({
    kind: "read_only_line",
    because: "A control cannot be registered for one named type, so acme:spectrum does not draw acme:Spectrum.",
  });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(spectrum))).toEqual({ kind: "read_only_line", because: "No control is registered for an input of type acme:Spectrum." });
  expect(table.registrationsPassedOver).toEqual([{ listed: spectrumView, because: "A control cannot be registered for one named type, so acme's control.ts draws none." }]);
});

test("only the Studio sets a built-in type's default, and only the module that brings a node type sets its body; each refusal is kept with why", () => {
  const acmeFloatDefault = listedElementOf("acme", { kind: "control", type: "float", control: null });
  const acmeCrossfadeBody = listedElementOf("acme", { kind: "node_body", node_type: "acme:Crossfade" });
  const otherFaderBody = listedElementOf("other", { kind: "node_body", node_type: "acme:Fader" });
  const table = new NodeUiControlTable({ elements: [acmeFloatDefault, acmeCrossfadeBody, otherFaderBody] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float)).kind).toBe("read_only_line");
  expect(table.nodeBodyForTheNodeType("acme:Crossfade")).toBe(acmeCrossfadeBody);
  expect(table.nodeBodyForTheNodeType("acme:Fader")).toBeNull();
  expect(table.registrationsPassedOver).toEqual([
    { listed: acmeFloatDefault, because: "Only Tato Studio sets the default control of a built-in type; acme registers one for float." },
    { listed: otherFaderBody, because: "Only the module that brings acme:Fader registers its body; other registers one." },
  ]);
});

test("a second element under a key already taken is passed over with a diagnostic naming the one that holds it", () => {
  const firstSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script: "float_slider.ts" });
  const secondSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script: "float_slider_again.ts" });
  const table = new NodeUiControlTable({ elements: [firstSlider, secondSlider] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float, { control: "slider" }))).toMatchObject({ kind: "element", listed: firstSlider });
  expect(table.registrationsPassedOver).toEqual([{ listed: secondSlider, because: "studio's float_slider.ts already registers the control slider for float." }]);
});

test("the table chooses a blocked element all the same, so loading it ends at the read-only line and never at another control", () => {
  const blockedSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script_serving: { kind: "blocked", findings: ["float_slider.ts:3:1 TS2322"] } });
  const floatDefault = listedElementOf("studio", { kind: "control", type: "float", control: null });
  const table = new NodeUiControlTable({ elements: [blockedSlider, floatDefault] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float, { control: "slider" }))).toEqual({ kind: "element", listed: blockedSlider, chosen_by: "annotation", because: null });
});
