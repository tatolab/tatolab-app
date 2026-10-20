// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { MachineSetupTrigger } from "../tatolab_machine_setup.js";
import { LINUX_NEEDS_NO_MACHINE_SETUP, MachineSetUpByTheInstaller } from "./machine_set_up_by_the_installer.js";

const temporaryHomeDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryHomeDirectories.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

test("the_machine_is_set_up_and_the_cli_reads_linked_only_while_its_link_resolves", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "tl-app-home-"));
  temporaryHomeDirectories.push(home);
  const linkPath = path.join(home, ".local/bin/tatolab");
  const installedCommandLineTool = path.join(home, ".local/share/tatolab/0.46.0/bin/tatolab");
  const machineSetup = new MachineSetUpByTheInstaller(linkPath);
  const observedLink = async () => {
    const observation = await machineSetup.observeMachineSetup();
    expect(observation.machineSetupState).toBe("complete");
    return observation.commandLineToolLinkedAt;
  };

  expect(await observedLink()).toBeNull();

  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(installedCommandLineTool, linkPath);
  expect(await observedLink(), "a dangling link runs nothing").toBeNull();

  await mkdir(path.dirname(installedCommandLineTool), { recursive: true });
  await writeFile(installedCommandLineTool, "");
  expect(await observedLink()).toBe(linkPath);
});

test("nothing_is_ever_set_up_and_set_up_tatolab_is_refused", async () => {
  const machineSetup = new MachineSetUpByTheInstaller(null);

  for (const trigger of ["reconciling_the_switch", "app_opened", "user_asked"] satisfies MachineSetupTrigger[]) {
    expect(await machineSetup.setUpTheMachine(trigger), trigger).toBe("no_administrator_prompt_shown");
  }
  expect(machineSetup.setUpTatolabRefusal()).toBe(LINUX_NEEDS_NO_MACHINE_SETUP);
  expect(await machineSetup.observeMachineSetup()).toEqual({ machineSetupState: "complete", commandLineToolLinkedAt: null });
});
