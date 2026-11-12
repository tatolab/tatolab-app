import { expect, test } from "vitest";
import { TATOLAB_APP_IDENTIFIER, TATOLAB_LOCAL_PROOF_APP_IDENTIFIER, tatolabAppIdentifierOfTheBuild } from "./tatolab_app_identifier.js";

test("a shipped build names its config directory with the installed app's identifier", () => {
  expect(tatolabAppIdentifierOfTheBuild({ machineDirectoriesUnderATestRoot: false })).toBe("com.tatolab.tatolab");
});

test("a local-proof build names its config directory with an identifier of its own, never the installed app's", () => {
  expect(tatolabAppIdentifierOfTheBuild({ machineDirectoriesUnderATestRoot: true })).toBe("com.tatolab.tatolab.proof");
  expect(TATOLAB_LOCAL_PROOF_APP_IDENTIFIER).not.toBe(TATOLAB_APP_IDENTIFIER);
});
