import { expect, test } from "vitest";
import { failedWith } from "../../result.js";
import { LINUX_TATOLAB_UNINSTALL } from "./tatolab_uninstall_refused_on_linux.js";

test("Linux refuses Uninstall Spudnik Studio… and says the installer does it, turning nothing off", async () => {
  const runTatolabSwitchCalls: boolean[] = [];
  expect(
    await LINUX_TATOLAB_UNINSTALL.uninstallTatolab({
      setRunTatolab: async (runTatolab) => {
        runTatolabSwitchCalls.push(runTatolab);
        return { kind: "unregistered" };
      },
    }),
  ).toEqual(failedWith("On Linux the installer uninstalls Tatolab: Settings › Uninstall Spudnik Studio… shows how."));
  expect(runTatolabSwitchCalls).toEqual([]);
});
