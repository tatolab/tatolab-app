// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Drives the built Linux runtime service and Run Tatolab switch through the systemctl on the PATH: node drive-the-run-tatolab-switch.mjs status|on|off
const B = new URL("../../src-electron/build/src-electron/src", import.meta.url).pathname;
const { SystemdUserRuntimeService, SystemctlOnThePath } = await import(`${B}/platform/linux/systemd_user_runtime_service.js`);
const { RunTatolabSwitch } = await import(`${B}/run_tatolab_switch.js`);
const { RunTatolabPreferenceFile } = await import(`${B}/run_tatolab_preference.js`);
const { createTatolabAppLog } = await import(`${B}/tatolab_app_log.js`);
const { mkdtemp } = await import("node:fs/promises");
const log = createTatolabAppLog("info", (l) => process.stdout.write(`  log: ${l}\n`));
const service = new SystemdUserRuntimeService(new SystemctlOnThePath(), log);
const step = process.argv[2];
const say = (what, value) => console.log(`${what}: ${JSON.stringify(value)}`);
if (step === "status") say("registrationStatus", await service.registrationStatus());
else {
  const sw = await RunTatolabSwitch.load(service, RunTatolabPreferenceFile.inAppConfigDirectory(await mkdtemp("/tmp/tl-app-config-"), log), performance.now(), log);
  if (step === "on") say("Run Tatolab on", await sw.setRunTatolab(true, true, performance.now()));
  if (step === "off") say("Run Tatolab off", await sw.setRunTatolab(false, true, performance.now()));
  say("registrationStatus after", await service.registrationStatus());
}
