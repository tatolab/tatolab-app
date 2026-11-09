import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { commandLineToolCopyOutsideTheAppImage, copyTheCommandLineToolOutOfTheAppImage } from "./command_line_tool_copied_out_of_the_appimage.js";

const scratchFolder = path.join(os.tmpdir(), `tl-appimage-${randomUUID()}`);
const carriedCommandLineTool = path.join(scratchFolder, "mount", "resources", "tatolab-runtime", "bin", "tatolab");
const copyPath = path.join(scratchFolder, "home", ".local", "share", "tato-studio", "bin", "tatolab");

async function plantTheCarriedCommandLineTool(contents: string, modifiedAtSeconds: number): Promise<void> {
  await mkdir(path.dirname(carriedCommandLineTool), { recursive: true });
  await writeFile(carriedCommandLineTool, contents);
  await chmod(carriedCommandLineTool, 0o755);
  await utimes(carriedCommandLineTool, modifiedAtSeconds, modifiedAtSeconds);
}

afterEach(async () => {
  await rm(scratchFolder, { recursive: true, force: true });
});

test("the_copy_sits_under_xdg_data_home_when_it_is_absolute_and_under_local_share_otherwise", () => {
  expect(commandLineToolCopyOutsideTheAppImage("/data", "/home/someone")).toBe("/data/tato-studio/bin/tatolab");
  expect(commandLineToolCopyOutsideTheAppImage(undefined, "/home/someone")).toBe("/home/someone/.local/share/tato-studio/bin/tatolab");
  expect(commandLineToolCopyOutsideTheAppImage("relative", "/home/someone")).toBe("/home/someone/.local/share/tato-studio/bin/tatolab");
});

test("the_cli_is_copied_runnable_with_its_folder", async () => {
  await plantTheCarriedCommandLineTool("#!/bin/sh\necho 0.68.27\n", 1_700_000_000);
  expect(await copyTheCommandLineToolOutOfTheAppImage(carriedCommandLineTool, copyPath)).toEqual({ ok: true, value: undefined });
  expect(await readFile(copyPath, "utf8")).toBe("#!/bin/sh\necho 0.68.27\n");
  expect((await stat(copyPath)).mode & 0o111).not.toBe(0);
});

test("a_newer_appimage_replaces_the_copy_and_the_same_one_leaves_it", async () => {
  await plantTheCarriedCommandLineTool("old", 1_700_000_000);
  await copyTheCommandLineToolOutOfTheAppImage(carriedCommandLineTool, copyPath);
  await writeFile(copyPath, "the");
  await utimes(copyPath, 1_700_000_000, 1_700_000_000);
  expect(await copyTheCommandLineToolOutOfTheAppImage(carriedCommandLineTool, copyPath)).toEqual({ ok: true, value: undefined });
  expect(await readFile(copyPath, "utf8")).toBe("the");
  await plantTheCarriedCommandLineTool("newer", 1_800_000_000);
  expect(await copyTheCommandLineToolOutOfTheAppImage(carriedCommandLineTool, copyPath)).toEqual({ ok: true, value: undefined });
  expect(await readFile(copyPath, "utf8")).toBe("newer");
});

test("a_missing_cli_is_refused_in_words_and_leaves_no_partial_copy", async () => {
  const copied = await copyTheCommandLineToolOutOfTheAppImage(carriedCommandLineTool, copyPath);
  expect(copied.ok).toBe(false);
  if (!copied.ok) expect(copied.failure).toContain(`tatolab couldn't be copied out of the AppImage to ${copyPath}`);
  await expect(stat(`${copyPath}.tato-studio-copy`)).rejects.toThrow();
});
