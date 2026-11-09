// Packages the built Electron app (`npm ci` and `npm run build` first)
// for one platform with @electron/packager: it stages exactly what the main process, the preload
// and the window load, with the production dependencies the lockfile installed, packs it into the
// asar, and flips Electron's fuses. Prints the packaged app's path (Tato Studio.app on macOS, the
// app's directory on Linux) as its last line.
//
// The app keeps the build features `npm run build` wrote; a local-proof build passes its flags
// there.
//
// Usage: node scripts/package_tatolab_electron_app.mjs <darwin|linux> <app version> <output dir>
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { packager } from "@electron/packager";
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tatoAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(tatoAppRoot, "..", "..");
const [targetPlatform, appVersion, outputDirectoryArgument, ...remainingArguments] = process.argv.slice(2);
const argumentsAreValid =
  ["darwin", "linux"].includes(targetPlatform) && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(appVersion ?? "") && outputDirectoryArgument !== undefined && remainingArguments.length === 0;
if (!argumentsAreValid) {
  process.stderr.write("usage: package_tatolab_electron_app.mjs <darwin|linux> <X.Y.Z> <output dir>\n");
  process.exit(2);
}
const outputDirectory = path.resolve(outputDirectoryArgument);
const stagedAppDirectory = path.join(outputDirectory, "staged-app");

const tatoAppPackageJson = JSON.parse(await readFile(path.join(tatoAppRoot, "package.json"), "utf8"));
const electronVersion = JSON.parse(await readFile(createRequire(import.meta.url).resolve("electron/package.json"), "utf8")).version;

await rm(stagedAppDirectory, { recursive: true, force: true });
await mkdir(stagedAppDirectory, { recursive: true });
// productName names the bundle and the Linux window class; the main process sets userData itself.
await writeFile(
  path.join(stagedAppDirectory, "package.json"),
  `${JSON.stringify({ name: "tatolab", productName: "Tato Studio", version: appVersion, private: true, type: "module", main: tatoAppPackageJson.main }, null, 2)}\n`,
);
// The mock backend and its presets are the dev server's alone; a window built with them could show made-up streams.
const mockWindowModuleNames = ["mock_tatolab_backend", "mock_window_preset"];
for (const builtWindowFileName of await readdir(path.join(tatoAppRoot, "out", "renderer", "assets"))) {
  const mockWindowModuleName = mockWindowModuleNames.find((moduleName) => builtWindowFileName.startsWith(`${moduleName}-`));
  if (mockWindowModuleName !== undefined) {
    throw new Error(`out/renderer/assets/${builtWindowFileName} is the mock window's ${mockWindowModuleName}, which the app never ships: run npm run build`);
  }
}
// macOS carries the viewer addon in Contents/Frameworks/, where build-tatolab-app.sh places it, since
// code signing reads Mach-O there; Linux carries it beside the asar.
const builtDirectoriesTheAppCarries = targetPlatform === "darwin" ? ["main", "preload", "renderer"] : ["main", "preload", "renderer", "native"];
for (const builtProcessDirectory of builtDirectoriesTheAppCarries) {
  await cp(path.join(tatoAppRoot, "out", builtProcessDirectory), path.join(stagedAppDirectory, "out", builtProcessDirectory), { recursive: true });
}
for (const trayIconFileName of ["tray-template.png", "tray-template@2x.png", "tray-coloured.png"]) {
  await cp(path.join(tatoAppRoot, "resources", trayIconFileName), path.join(stagedAppDirectory, "resources", trayIconFileName));
}
// The main process's runtime dependencies, as `npm ci` installed them from the lockfile: every
// package `npm ls --omit=dev` names for the app's workspace, at the path it holds under the
// node_modules npm put it in, the monorepo root's or the app's own. A workspace's link there is
// the workspace's own source, never a dependency the app carries.
const nodeModulesDirectoriesNpmInstallsInto = [path.join(tatoAppRoot, "node_modules"), path.join(monorepoRoot, "node_modules")];
const productionPackageDirectories = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable", "--workspace", tatoAppPackageJson.name], { cwd: monorepoRoot, encoding: "utf8" })
  .split("\n")
  .filter((packageDirectory) => packageDirectory !== "" && !lstatSync(packageDirectory).isSymbolicLink());
for (const productionPackageDirectory of productionPackageDirectories) {
  const nodeModulesDirectoryHoldingThePackage = nodeModulesDirectoriesNpmInstallsInto.find((nodeModulesDirectory) => productionPackageDirectory.startsWith(nodeModulesDirectory + path.sep));
  if (nodeModulesDirectoryHoldingThePackage === undefined) continue;
  await cp(productionPackageDirectory, path.join(stagedAppDirectory, "node_modules", path.relative(nodeModulesDirectoryHoldingThePackage, productionPackageDirectory)), {
    recursive: true,
    filter: (sourcePath) => !sourcePath.slice(productionPackageDirectory.length).includes(`${path.sep}node_modules${path.sep}`),
  });
}

// electron-updater names its download cache from resources/app-update.yml, and refuses to download
// without the file. The feed itself is set from the build features, so the file holds only the name.
const appUpdateConfigFile = path.join(outputDirectory, "app-update.yml");
await writeFile(appUpdateConfigFile, "updaterCacheDirName: tatolab-app-updater\n");

// Linux keeps the executable name earlier builds installed, /usr/lib/tatolab/Tatolab, which the
// person's autostart entry and /usr/bin/Tatolab name.
const packagedExecutableName = targetPlatform === "darwin" ? "Tato Studio" : "Tatolab";

const [packagedDirectory] = await packager({
  dir: stagedAppDirectory,
  out: outputDirectory,
  overwrite: true,
  platform: targetPlatform,
  arch: targetPlatform === "darwin" ? "arm64" : "x64",
  electronVersion,
  name: "Tato Studio",
  executableName: packagedExecutableName,
  appVersion,
  buildVersion: appVersion,
  appBundleId: "com.tatolab.tatolab",
  appCategoryType: "public.app-category.developer-tools",
  appCopyright: `Copyright (c) ${new Date().getFullYear()} Tatolab LLC`,
  extendInfo: path.join(tatoAppRoot, "packaging", "macos", "Info.plist"),
  icon: path.join(tatoAppRoot, "packaging", "icons", "icon.icns"),
  // The code pane's Pyright runs from its files on disk beside the asar, where electron_app_entry
  // names it, so its worker threads and bundled typeshed stubs are read as plain files; on Linux the
  // viewer addon too, since a native module loads only from a plain file.
  asar: { unpack: "{**/node_modules/pyright/**,**/out/native/**}" },
  prune: false,
  extraResource: [appUpdateConfigFile],
});
const packagedApp = targetPlatform === "darwin" ? path.join(packagedDirectory, "Tato Studio.app") : packagedDirectory;

// Any process could otherwise run the signed app as plain Node (ELECTRON_RUN_AS_NODE,
// NODE_OPTIONS, --inspect) and inherit its camera and microphone grants.
// flipFuses takes the bundle on macOS and the executable on Linux.
await flipFuses(targetPlatform === "darwin" ? packagedApp : path.join(packagedApp, packagedExecutableName), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  // Electron validates the asar against Info.plist's ElectronAsarIntegrity on macOS only.
  ...(targetPlatform === "darwin" ? { [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true } : {}),
});

process.stdout.write(`${packagedApp}\n`);
