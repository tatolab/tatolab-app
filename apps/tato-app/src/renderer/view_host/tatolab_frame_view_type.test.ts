import { readTatolabViewManifest, type TatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import { expect, test } from "vitest";
import { framePermissionsPolicyOf } from "./tatolab_frame_view_type";

function manifestDeclaring(capabilities: string[]): TatolabViewManifest {
  const reading = readTatolabViewManifest({ contract: "1.0", title: "Deck", entry: "index.html", placement: "area", capabilities });
  if (reading.kind === "not_read") return expect.unreachable(reading.because);
  return reading.manifest;
}

test("a view's frame is allowed the camera and microphone its manifest declares, and refused each it leaves out", () => {
  expect(framePermissionsPolicyOf(manifestDeclaring([]))).toBe("camera 'none'; microphone 'none'");
  expect(framePermissionsPolicyOf(manifestDeclaring(["gpu", "camera"]))).toBe("camera; microphone 'none'");
  expect(framePermissionsPolicyOf(manifestDeclaring(["microphone", "read.selection"]))).toBe("camera 'none'; microphone");
  expect(framePermissionsPolicyOf(manifestDeclaring(["camera", "microphone"]))).toBe("camera; microphone");
});
