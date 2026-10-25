// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Packages the built Electron app (`npm ci`, `npm run build` and `npm run build:electron` first)
// for one platform with @electron/packager: it stages exactly what the main process, the preload
// and the window load, with the production dependencies the lockfile installed, packs it into the
// asar, and flips Electron's fuses. Prints the packaged app's path (Tatolab.app on macOS, the
// app's directory on Linux) as its last line.
//
// Usage: node scripts/package_tatolab_electron_app.mjs <darwin|linux> <app version> <output dir> [--local-proof-test-root] [--app-update-feed-url URL]
//   --local-proof-test-root     the app keeps every machine directory under the local-proof test root;
//                               never shipped
//   --app-update-feed-url URL   the app reads its updates from URL instead of get.tatolab.com; only
//                               with --local-proof-test-root
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [targetPlatform, appVersion, outputDirectoryArgument, ...remainingArguments] = process.argv.slice(2);
let localProofTestRoot = false;
let localAppUpdateFeedUrl = null;
let argumentsAreValid = ["darwin", "linux"].includes(targetPlatform) && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(appVersion ?? "") && outputDirectoryArgument !== undefined;
for (let argumentIndex = 0; argumentIndex < remainingArguments.length; argumentIndex += 1) {
  const argument = remainingArguments[argumentIndex];
  if (argument === "--local-proof-test-root") {
    localProofTestRoot = true;
  } else if (argument === "--app-update-feed-url" && URL.canParse(remainingArguments[argumentIndex + 1] ?? "")) {
    localAppUpdateFeedUrl = remainingArguments[argumentIndex + 1];
    argumentIndex += 1;
  } else {
    argumentsAreValid = false;
  }
}
if (!argumentsAreValid) {
  process.stderr.write("usage: package_tatolab_electron_app.mjs <darwin|linux> <X.Y.Z> <output dir> [--local-proof-test-root] [--app-update-feed-url URL]\n");
  process.exit(2);
}
if (localAppUpdateFeedUrl !== null && !localProofTestRoot) {
  process.stderr.write("--app-update-feed-url needs --local-proof-test-root: a shipped app reads its updates only from get.tatolab.com\n");
  process.exit(2);
}
const outputDirectory = path.resolve(outputDirectoryArgument);
const stagedAppDirectory = path.join(outputDirectory, "staged-app");
const builtFeaturesModule = path.join("out", "main", "tatolab_app_build_features.js");
const shippingFeaturesLiteral = "machineDirectoriesUnderATestRoot: false";
const localProofFeaturesLiteral = "machineDirectoriesUnderATestRoot: true";
const shippingAppUpdateFeedLiteral = 'appUpdateFeedUrl: "https://get.tatolab.com/app/"';

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
// The mock backend and its presets are the dev server's alone; a window built with them could show made-up streams.
const mockWindowModuleNames = ["mock_tatolab_backend", "mock_window_preset"];
for (const builtWindowFileName of await readdir(path.join(stagedAppDirectory, "dist", "assets"))) {
  const mockWindowModuleName = mockWindowModuleNames.find((moduleName) => builtWindowFileName.startsWith(`${moduleName}-`));
  if (mockWindowModuleName !== undefined) {
    throw new Error(`dist/assets/${builtWindowFileName} is the mock window's ${mockWindowModuleName}, which the app never ships: run npm run build`);
  }
}
await cp(path.join(repositoryRoot, "out"), path.join(stagedAppDirectory, "out"), { recursive: true });
for (const trayIconFileName of ["tray-template.png", "tray-template@2x.png", "tray-coloured.png"]) {
  await cp(path.join(repositoryRoot, "resources", trayIconFileName), path.join(stagedAppDirectory, "resources", trayIconFileName));
}
// The main process's runtime dependencies, as `npm ci` installed them from the lockfile: every
// package `npm ls --omit=dev` names, at the path it holds under node_modules.
const productionPackageDirectories = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], { cwd: repositoryRoot, encoding: "utf8" })
  .split("\n")
  .filter((packageDirectory) => packageDirectory.startsWith(path.join(repositoryRoot, "node_modules") + path.sep));
for (const productionPackageDirectory of productionPackageDirectories) {
  await cp(productionPackageDirectory, path.join(stagedAppDirectory, path.relative(repositoryRoot, productionPackageDirectory)), {
    recursive: true,
    filter: (sourcePath) => !sourcePath.slice(productionPackageDirectory.length).includes(`${path.sep}node_modules${path.sep}`),
  });
}

const stagedFeaturesModule = path.join(stagedAppDirectory, builtFeaturesModule);
const builtFeaturesSource = await readFile(stagedFeaturesModule, "utf8");
if (builtFeaturesSource.split(shippingFeaturesLiteral).length !== 2) {
  throw new Error(`${builtFeaturesModule} does not carry "${shippingFeaturesLiteral}" exactly once: run npm run build:electron`);
}
if (builtFeaturesSource.split(shippingAppUpdateFeedLiteral).length !== 2) {
  throw new Error(`${builtFeaturesModule} does not carry '${shippingAppUpdateFeedLiteral}' exactly once: run npm run build:electron`);
}
let stagedFeaturesSource = builtFeaturesSource;
if (localProofTestRoot) stagedFeaturesSource = stagedFeaturesSource.replace(shippingFeaturesLiteral, localProofFeaturesLiteral);
if (localAppUpdateFeedUrl !== null) stagedFeaturesSource = stagedFeaturesSource.replace(shippingAppUpdateFeedLiteral, `appUpdateFeedUrl: ${JSON.stringify(localAppUpdateFeedUrl)}`);
await writeFile(stagedFeaturesModule, stagedFeaturesSource);
// electron-updater names its download cache from resources/app-update.yml, and refuses to download
// without the file. The feed itself is set from the build features, so the file holds only the name.
const appUpdateConfigFile = path.join(outputDirectory, "app-update.yml");
await writeFile(appUpdateConfigFile, "updaterCacheDirName: tatolab-app-updater\n");

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
  extendInfo: path.join(repositoryRoot, "packaging", "macos", "Info.plist"),
  icon: path.join(repositoryRoot, "resources", "icon.icns"),
  asar: true,
  prune: false,
  extraResource: [appUpdateConfigFile],
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
