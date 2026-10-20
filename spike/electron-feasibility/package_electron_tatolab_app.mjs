// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Packages the spike as an unsigned Tatolab.app (bundle id com.tatolab.tatolab, executable
// Contents/MacOS/Tatolab, the Tauri app's Info.plist keys) into the directory argv[2] names.
import { packager } from "@electron/packager";
import path from "node:path";
import { fileURLToPath } from "node:url";

const spikeDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = process.argv[2];
const appBundleId = process.argv[3] ?? "com.tatolab.tatolab";
const [appPath] = await packager({
  dir: spikeDirectory,
  out: outputDirectory,
  overwrite: true,
  platform: "darwin",
  arch: "arm64",
  name: "Tatolab",
  executableName: "Tatolab",
  appBundleId,
  helperBundleId: `${appBundleId}.helper`,
  extendInfo: path.join(spikeDirectory, "../../src-tauri/macos/Info.plist"),
  icon: path.join(spikeDirectory, "../../src-tauri/icons/icon.icns"),
  asar: true,
  prune: true,
  ignore: [/\.sh$/, /\.mjs$/, /\.ts$/, /^\/entitlements/, /^\/proof/, /node_modules\/@moq/],
});
process.stdout.write(`${path.join(appPath, "Tatolab.app")}\n`);
