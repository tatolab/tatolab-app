// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Packages the built Electron app (`npm run build` and `npm run build:electron` first) for one
// platform with @electron/packager: it stages exactly what the main process, the preload and the
// window load, packs it into the asar, and flips Electron's fuses. Prints the packaged app's path
// (Tatolab.app on macOS, the app's directory on Linux) as its last line.
//
// Usage: node scripts/package_tatolab_electron_app.mjs <darwin|linux> <app version> <output dir> [--local-proof-test-root]
//   --local-proof-test-root  the app keeps every machine directory under the local-proof test root;
//                            never shipped
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { packager } from "@electron/packager";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [targetPlatform, appVersion, outputDirectoryArgument, ...remainingArguments] = process.argv.slice(2);
const localProofTestRoot = remainingArguments.includes("--local-proof-test-root");
const unknownArguments = remainingArguments.filter((argument) => argument !== "--local-proof-test-root");
if (!["darwin", "linux"].includes(targetPlatform) || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(appVersion ?? "") || outputDirectoryArgument === undefined || unknownArguments.length > 0) {
  process.stderr.write("usage: package_tatolab_electron_app.mjs <darwin|linux> <X.Y.Z> <output dir> [--local-proof-test-root]\n");
  process.exit(2);
}
const outputDirectory = path.resolve(outputDirectoryArgument);
const stagedAppDirectory = path.join(outputDirectory, "staged-app");
const builtFeaturesModule = path.join("src-electron", "build", "src-electron", "src", "tatolab_app_build_features.js");
const shippingFeaturesLiteral = "machineDirectoriesUnderATestRoot: false";
const localProofFeaturesLiteral = "machineDirectoriesUnderATestRoot: true";

const repositoryPackageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const electronVersion = JSON.parse(await readFile(path.join(repositoryRoot, "node_modules", "electron", "package.json"), "utf8")).version;

await rm(stagedAppDirectory, { recursive: true, force: true });
await mkdir(stagedAppDirectory, { recursive: true });
// productName names the bundle and the Linux window class; the main process sets userData itself.
await writeFile(
  path.join(stagedAppDirectory, "package.json"),
  `${JSON.stringify({ name: "tatolab", productName: "Tatolab", version: appVersion, private: true, type: "module", main: repositoryPackageJson.main }, null, 2)}\n`,
);
await cp(path.join(repositoryRoot, "dist"), path.join(stagedAppDirectory, "dist"), { recursive: true });
await cp(path.join(repositoryRoot, "src-electron", "build"), path.join(stagedAppDirectory, "src-electron", "build"), { recursive: true });
for (const trayIconFileName of ["tray-template.png", "tray-template@2x.png", "tray-coloured.png"]) {
  await cp(path.join(repositoryRoot, "src-tauri", "icons", trayIconFileName), path.join(stagedAppDirectory, "src-tauri", "icons", trayIconFileName));
}

const stagedFeaturesModule = path.join(stagedAppDirectory, builtFeaturesModule);
const builtFeaturesSource = await readFile(stagedFeaturesModule, "utf8");
if (builtFeaturesSource.split(shippingFeaturesLiteral).length !== 2) {
  throw new Error(`${builtFeaturesModule} does not carry "${shippingFeaturesLiteral}" exactly once: run npm run build:electron`);
}
if (localProofTestRoot) await writeFile(stagedFeaturesModule, builtFeaturesSource.replace(shippingFeaturesLiteral, localProofFeaturesLiteral));

const [packagedDirectory] = await packager({
  dir: stagedAppDirectory,
  out: outputDirectory,
  overwrite: true,
  platform: targetPlatform,
  arch: targetPlatform === "darwin" ? "arm64" : "x64",
  electronVersion,
  name: "Tatolab",
  executableName: "Tatolab",
  appVersion,
  buildVersion: appVersion,
  appBundleId: "com.tatolab.tatolab",
  appCategoryType: "public.app-category.developer-tools",
  appCopyright: "Copyright (c) 2025 Jonathan Fontanez",
  extendInfo: path.join(repositoryRoot, "src-tauri", "macos", "Info.plist"),
  icon: path.join(repositoryRoot, "src-tauri", "icons", "icon.icns"),
  asar: true,
  prune: false,
});
const packagedApp = targetPlatform === "darwin" ? path.join(packagedDirectory, "Tatolab.app") : packagedDirectory;

// Any process could otherwise run the signed app as plain Node (ELECTRON_RUN_AS_NODE,
// NODE_OPTIONS, --inspect) and inherit its camera and microphone grants.
// flipFuses takes the bundle on macOS and the executable on Linux.
await flipFuses(targetPlatform === "darwin" ? packagedApp : path.join(packagedApp, "Tatolab"), {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: targetPlatform === "darwin",
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  // Electron validates the asar against Info.plist's ElectronAsarIntegrity on macOS only.
  ...(targetPlatform === "darwin" ? { [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true } : {}),
});

process.stdout.write(`${packagedApp}\n`);
