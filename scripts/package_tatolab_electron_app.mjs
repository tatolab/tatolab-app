// Packages the built Electron app (`npm ci` and `npm run build` first)
// for one platform with @electron/packager: it stages exactly what the main process, the preload
// and the window load, with the production dependencies the lockfile installed, packs it into the
// asar, and flips Electron's fuses. Prints the packaged app's path (Tatolab.app on macOS, the
// app's directory on Linux) as its last line.
//
// The app keeps the build features `npm run build` wrote; a local-proof build passes its flags
// there.
//
// Usage: node scripts/package_tatolab_electron_app.mjs <darwin|linux> <app version> <output dir>
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [targetPlatform, appVersion, outputDirectoryArgument, ...remainingArguments] = process.argv.slice(2);
const argumentsAreValid =
  ["darwin", "linux"].includes(targetPlatform) && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(appVersion ?? "") && outputDirectoryArgument !== undefined && remainingArguments.length === 0;
if (!argumentsAreValid) {
  process.stderr.write("usage: package_tatolab_electron_app.mjs <darwin|linux> <X.Y.Z> <output dir>\n");
  process.exit(2);
}
const outputDirectory = path.resolve(outputDirectoryArgument);
const stagedAppDirectory = path.join(outputDirectory, "staged-app");

const repositoryPackageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const electronVersion = JSON.parse(await readFile(path.join(repositoryRoot, "node_modules", "electron", "package.json"), "utf8")).version;

await rm(stagedAppDirectory, { recursive: true, force: true });
await mkdir(stagedAppDirectory, { recursive: true });
// productName names the bundle and the Linux window class; the main process sets userData itself.
await writeFile(
  path.join(stagedAppDirectory, "package.json"),
  `${JSON.stringify({ name: "tatolab", productName: "Tatolab", version: appVersion, private: true, type: "module", main: repositoryPackageJson.main }, null, 2)}\n`,
);
// The mock backend and its presets are the dev server's alone; a window built with them could show made-up streams.
const mockWindowModuleNames = ["mock_tatolab_backend", "mock_window_preset"];
for (const builtWindowFileName of await readdir(path.join(repositoryRoot, "out", "renderer", "assets"))) {
  const mockWindowModuleName = mockWindowModuleNames.find((moduleName) => builtWindowFileName.startsWith(`${moduleName}-`));
  if (mockWindowModuleName !== undefined) {
    throw new Error(`out/renderer/assets/${builtWindowFileName} is the mock window's ${mockWindowModuleName}, which the app never ships: run npm run build`);
  }
}
for (const builtProcessDirectory of ["main", "preload", "renderer"]) {
  await cp(path.join(repositoryRoot, "out", builtProcessDirectory), path.join(stagedAppDirectory, "out", builtProcessDirectory), { recursive: true });
}
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
  icon: path.join(repositoryRoot, "packaging", "icons", "icon.icns"),
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
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  // Electron validates the asar against Info.plist's ElectronAsarIntegrity on macOS only.
  ...(targetPlatform === "darwin" ? { [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true } : {}),
});

process.stdout.write(`${packagedApp}\n`);
