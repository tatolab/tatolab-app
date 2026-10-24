// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Drives the built Linux runtime service and Run Tatolab switch through the systemctl on the PATH: node drive-the-run-tatolab-switch.mjs status|on|off
const electronBuildSourceDirectory = new URL("../../src-electron/build/src-electron/src", import.meta.url).pathname;
const { SystemdUserRuntimeService, SystemctlOnThePath } = await import(`${electronBuildSourceDirectory}/platform/linux/systemd_user_runtime_service.js`);
const { RunTatolabSwitch } = await import(`${electronBuildSourceDirectory}/run_tatolab_switch.js`);
const { RememberedSwitchFile } = await import(`${electronBuildSourceDirectory}/remembered_switch_file.js`);
const { createTatolabAppLog } = await import(`${electronBuildSourceDirectory}/tatolab_app_log.js`);
const { mkdtemp } = await import("node:fs/promises");
const tatolabAppLog = createTatolabAppLog("info", (logLine) => process.stdout.write(`  log: ${logLine}\n`));
const systemdUserRuntimeService = new SystemdUserRuntimeService(new SystemctlOnThePath(), tatolabAppLog);
const proofStepName = process.argv[2];
const printProofStep = (proofStep, value) => console.log(`${proofStep}: ${JSON.stringify(value)}`);
if (proofStepName === "status") printProofStep("registrationStatus", await systemdUserRuntimeService.registrationStatus());
else {
  const runTatolabSwitch = await RunTatolabSwitch.load(systemdUserRuntimeService, RememberedSwitchFile.runTatolabInAppConfigDirectory(await mkdtemp("/tmp/tl-app-config-"), tatolabAppLog), performance.now(), tatolabAppLog);
  if (proofStepName === "on") printProofStep("Run Tatolab on", await runTatolabSwitch.setRunTatolab(true, true, performance.now()));
  if (proofStepName === "off") printProofStep("Run Tatolab off", await runTatolabSwitch.setRunTatolab(false, true, performance.now()));
  printProofStep("registrationStatus after", await systemdUserRuntimeService.registrationStatus());
}
