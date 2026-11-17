import { expect, test } from "vitest";
import { BUILT_IN_PIN_TYPES } from "../pin_types.js";
import { NodeUiControlTable } from "./node_ui_control_table.js";
import { inputDeclarationOf, listedElementOf, ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME } from "./node_ui_test_listing.js";

test("with no element listed, every built-in pin type's input gets the read-only line with its reason", () => {
  const table = new NodeUiControlTable({ elements: [] });
  for (const { name, label } of BUILT_IN_PIN_TYPES) {
    const pinType = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME[name];
    const typeWords = pinType.type === "named" ? pinType.named_pin_type : label;
    expect(table.controlChoiceForTheInput(inputDeclarationOf(pinType)), name).toEqual({ kind: "read_only_line", because: `No control is registered for an input of type ${typeWords}.` });
  }
});

test("the Studio's default for each built-in pin type draws its inputs, and a named type has none from the Studio", () => {
  const defaults = BUILT_IN_PIN_TYPES.map(({ name }) => listedElementOf("studio", { kind: "control", type: name, control: null }, { script: `${name}.ts` }));
  const table = new NodeUiControlTable({ elements: defaults });
  for (const { name } of BUILT_IN_PIN_TYPES) {
    const choice = table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME[name]));
    if (name === "named") expect(choice.kind, name).toBe("read_only_line");
    else expect(choice, name).toEqual({ kind: "element", listed: defaults.find((listed) => listed.script === `${name}.ts`), chosen_by: "type_default" });
  }
});

test("the control an annotation names wins over the type's default, bare for the Studio's and qualified by its module for a project's", () => {
  const floatDefault = listedElementOf("studio", { kind: "control", type: "float", control: null }, { script: "float_number.ts" });
  const studioSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script: "float_slider.ts" });
  const acmeKnob = listedElementOf("acme", { kind: "control", type: "float", control: "knob" }, { script: "knob.ts" });
  const table = new NodeUiControlTable({ elements: [floatDefault, studioSlider, acmeKnob] });
  const float = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float;
  expect(table.controlChoiceForTheInput(inputDeclarationOf(float, { control: "slider" }))).toEqual({ kind: "element", listed: studioSlider, chosen_by: "annotation" });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(float, { control: "acme:knob" }))).toEqual({ kind: "element", listed: acmeKnob, chosen_by: "annotation" });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(float, { control: "knob" }))).toEqual({ kind: "element", listed: floatDefault, chosen_by: "type_default" });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(float, { control: null }))).toEqual({ kind: "element", listed: floatDefault, chosen_by: "type_default" });
});

test("a named control serves only the pin type it is registered for", () => {
  const acmeKnob = listedElementOf("acme", { kind: "control", type: "float", control: "knob" });
  const table = new NodeUiControlTable({ elements: [acmeKnob] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.integer, { control: "acme:knob" }))).toEqual({
    kind: "read_only_line",
    because: "No control named acme:knob is registered for an input of type Integer.",
  });
});

test("an annotation names a control for a named pin type, which has no default", () => {
  const spectrumView = listedElementOf("acme", { kind: "control", type: "named", control: "spectrum" });
  const table = new NodeUiControlTable({ elements: [spectrumView] });
  const spectrum = ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.named;
  expect(table.controlChoiceForTheInput(inputDeclarationOf(spectrum, { control: "acme:spectrum" }))).toEqual({ kind: "element", listed: spectrumView, chosen_by: "annotation" });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(spectrum))).toEqual({ kind: "read_only_line", because: "No control is registered for an input of type acme:Spectrum." });
});

test("only the Studio sets a built-in type's default, and only the module that brings a node type sets its body", () => {
  const acmeFloatDefault = listedElementOf("acme", { kind: "control", type: "float", control: null });
  const acmeCrossfadeBody = listedElementOf("acme", { kind: "node_body", node_type: "acme:Crossfade" });
  const otherCrossfadeBody = listedElementOf("other", { kind: "node_body", node_type: "acme:Fader" });
  const table = new NodeUiControlTable({ elements: [acmeFloatDefault, acmeCrossfadeBody, otherCrossfadeBody] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float)).kind).toBe("read_only_line");
  expect(table.nodeBodyForTheNodeType("acme:Crossfade")).toBe(acmeCrossfadeBody);
  expect(table.nodeBodyForTheNodeType("acme:Fader")).toBeNull();
});

test("the table chooses a blocked element all the same, so loading it ends at the read-only line and never at another control", () => {
  const blockedSlider = listedElementOf("studio", { kind: "control", type: "float", control: "slider" }, { script_serving: { kind: "blocked", findings: ["float_slider.ts:3:1 TS2322"] } });
  const floatDefault = listedElementOf("studio", { kind: "control", type: "float", control: null });
  const table = new NodeUiControlTable({ elements: [blockedSlider, floatDefault] });
  expect(table.controlChoiceForTheInput(inputDeclarationOf(ONE_PIN_TYPE_OF_EACH_BUILT_IN_NAME.float, { control: "slider" }))).toEqual({ kind: "element", listed: blockedSlider, chosen_by: "annotation" });
});
