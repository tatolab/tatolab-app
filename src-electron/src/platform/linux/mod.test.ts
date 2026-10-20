// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { failedWith } from "../../result.js";
import { LINUX_TATOLAB_UNINSTALL } from "./mod.js";

test("Linux refuses Uninstall Tatolab… and says the installer does it, turning nothing off", async () => {
  const runTatolabSwitchCalls: boolean[] = [];
  expect(
    await LINUX_TATOLAB_UNINSTALL.uninstallTatolab({
      setRunTatolab: async (runTatolab) => {
        runTatolabSwitchCalls.push(runTatolab);
        return { kind: "unregistered" };
      },
    }),
  ).toEqual(failedWith("On Linux the installer uninstalls Tatolab: Settings › Uninstall Tatolab… shows how."));
  expect(runTatolabSwitchCalls).toEqual([]);
});
