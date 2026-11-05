import { expect, test } from "vitest";
import { isANameTheCodeGave, nameInWords, nodeTitle, nodeTypeClassName } from "./node_words";

test("a_node_type_names_its_class_after_its_module", () => {
  expect(nodeTypeClassName("tatolab.stream:TestPatternSource")).toBe("TestPatternSource");
  expect(nodeTypeClassName("nodes.inverting_effect:InvertingEffect")).toBe("InvertingEffect");
});

test("a_class_name_or_a_key_reads_as_capitalised_words", () => {
  expect(nameInWords("TestPatternSource")).toBe("Test Pattern Source");
  expect(nameInWords("H264Encoder")).toBe("H264 Encoder");
  expect(nameInWords("device_id")).toBe("Device ID");
  expect(nameInWords("vsync")).toBe("Vsync");
});

test("an_unnamed_node_is_titled_by_its_type_and_a_named_one_by_its_own_name", () => {
  expect(nodeTitle("testpatternsource", "tatolab.stream:TestPatternSource")).toBe("Test Pattern Source");
  expect(nodeTitle("testpatternsource-2", "tatolab.stream:TestPatternSource")).toBe("Test Pattern Source 2");
  expect(nodeTitle("entrance_cam", "tatolab.stream:CameraSource")).toBe("entrance_cam");
  expect(isANameTheCodeGave("testpatternsource", "tatolab.stream:TestPatternSource")).toBe(false);
  expect(isANameTheCodeGave("entrance_cam", "tatolab.stream:CameraSource")).toBe(true);
});
