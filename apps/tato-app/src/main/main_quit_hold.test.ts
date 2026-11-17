import { afterEach, expect, test } from "vitest";
import { FakeTatolabElectronAppShell } from "./fake_tatolab_electron_app_shell.js";
import { startTatolabApp } from "./main.js";
import { tatolabPlatformItemsFor } from "./platform/tatolab_platform_items.js";

const fakeShells: FakeTatolabElectronAppShell[] = [];
afterEach(async () => {
  for (const fakeShell of fakeShells.splice(0)) await fakeShell.removeTheAppConfigDirectory();
});

test("a quit is held by one hold, as Electron runs each hold as a before-quit listener of its own, and that hold disposes the runtime the window's converted commands run on", async () => {
  const fakeShell = new FakeTatolabElectronAppShell();
  fakeShells.push(fakeShell);
  const tatolabRunningApp = await startTatolabApp(fakeShell.tatolabElectronAppShell, tatolabPlatformItemsFor("darwin", "arm64"), fakeShell.tatolabAppLog);
  await tatolabRunningApp?.statusPublisher.lastPublishedStatusWaitingUpTo(5_000);
  expect(fakeShell.quitHoldsRegistered()).toBe(1);

  fakeShell.beginQuitting();
  fakeShell.carriedRuntimeStarts.exitEveryRuntimeAskedToStop();
  await fakeShell.quitHeldUntil;

  expect(await fakeShell.invokeTheCommand("transact_in_the_open_project", { operations: [{ operation: "remove_node", stream: "s", node: "n" }], mode: "commit", idempotency_key: null })).toEqual({
    ok: false,
    refusal: expect.stringMatching(/^transact_in_the_open_project ended without an answer: /),
  });
});
