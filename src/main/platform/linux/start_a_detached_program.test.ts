import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { succeeded } from "../../result.js";
import { startADetachedProgramOnThePath } from "./start_a_detached_program.js";

test("a_detached_program_starts_in_its_working_folder_and_a_missing_one_answers_enoent", async () => {
  const workingFolder = await mkdtemp(path.join(os.tmpdir(), "tl-app-terminal-"));
  try {
    expect(await startADetachedProgramOnThePath("true", workingFolder)).toEqual(succeeded(undefined));
    const missing = await startADetachedProgramOnThePath("tatolab-app-no-such-program", workingFolder);
    expect(missing.ok ? null : missing.failure.errorCode).toBe("ENOENT");
  } finally {
    await rm(workingFolder, { recursive: true, force: true });
  }
});
