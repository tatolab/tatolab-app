import { readTatolabViewManifest } from "@tatolab/tato-app-view-sdk";
import { expect, test } from "vitest";
import { CORE_VIEW_FOLDERS } from "../core_view_folders";
import { CORE_VIEWS } from "./index";

test("lists every core view the build makes, each manifest passing the view schema as an area view", () => {
  expect(CORE_VIEWS.map((coreView) => coreView.folder)).toEqual([...CORE_VIEW_FOLDERS]);
  for (const coreView of CORE_VIEWS) {
    const reading = readTatolabViewManifest(JSON.parse(coreView.manifest_text));
    expect(reading.kind === "read" ? reading.manifest.placement : reading.because).toBe("area");
  }
});
