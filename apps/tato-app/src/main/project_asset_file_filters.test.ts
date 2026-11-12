import { expect, test } from "vitest";
import { projectAssetFileFiltersFor } from "./project_asset_file_filters.js";

const EVERY_FILE = { name: "All files", extensions: ["*"] };

test("a field taking any asset, or a medium the runtime reads from no file's extension, offers every file alone", () => {
  expect(projectAssetFileFiltersFor(null)).toEqual([EVERY_FILE]);
  expect(projectAssetFileFiltersFor([])).toEqual([EVERY_FILE]);
  expect(projectAssetFileFiltersFor(["scene"])).toEqual([EVERY_FILE]);
  expect(projectAssetFileFiltersFor(["image", "scene"])).toEqual([EVERY_FILE]);
  expect(projectAssetFileFiltersFor(["constructor"])).toEqual([EVERY_FILE]);
});

test("a field taking several media offers their files together first, each extension once, then every file", () => {
  expect(projectAssetFileFiltersFor(["lut"])).toEqual([{ name: "LUT files", extensions: ["cube"] }, EVERY_FILE]);
  const [videosAndAudio] = projectAssetFileFiltersFor(["video", "audio"]);
  expect(videosAndAudio?.name).toBe("Video and audio files");
  expect(videosAndAudio?.extensions.filter((extension) => extension === "mp4")).toEqual(["mp4"]);
  expect(videosAndAudio?.extensions).toContain("flac");
});
