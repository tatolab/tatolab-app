// Writes src/renderer/public/licenses/window-third-party-notices.txt: every npm package Vite bundles into the
// window's out/renderer/, with its version, licence and licence text. It builds the window with source maps
// into a temporary directory and reads which packages the bundle's sources come from, so the list
// is what ships, not what package.json names; the stylesheet's packages and fonts are added by name. Run it after changing the window's dependencies:
//   node scripts/write_window_third_party_notices.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tatoAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(tatoAppRoot, "..", "..");
const buildDirectory = mkdtempSync(path.join(os.tmpdir(), "tatolab-window-notices-"));
const LICENCE_FILE_NAMES = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;
/** The packages the design system's stylesheet, which the window imports, pulls in, and which the JavaScript bundle's source maps do not name. */
const STYLESHEET_PACKAGES = ["tailwindcss", "tw-animate-css", "shadcn", "@fontsource-variable/inter", "@fontsource-variable/geist-mono"];

/**
 * The package directory under node_modules a bundled source path comes from, scoped names included.
 * A web worker's source map names its sources relative to where Vite first built the worker, not to
 * the map, so a path that lands outside the monorepo is read from the node_modules npm installed the package in.
 */
function packageDirectoryOf(sourcePath) {
  const parts = sourcePath.split("/");
  const lastNodeModules = parts.lastIndexOf("node_modules");
  if (lastNodeModules === -1) return null;
  const nameParts = parts[lastNodeModules + 1]?.startsWith("@") ? 2 : 1;
  const packageDirectory = parts.slice(0, lastNodeModules + 1 + nameParts).join("/");
  if (packageDirectory.startsWith(monorepoRoot + path.sep)) return packageDirectory;
  return installedPackageDirectory(parts.slice(lastNodeModules + 1, lastNodeModules + 1 + nameParts).join("/"));
}

/** Where npm installed a package the app depends on: the app's own node_modules when it nests one there, otherwise the monorepo root's. */
function installedPackageDirectory(packageName) {
  const nestedInTheApp = path.join(tatoAppRoot, "node_modules", packageName);
  return existsSync(nestedInTheApp) ? nestedInTheApp : path.join(monorepoRoot, "node_modules", packageName);
}

try {
  execFileSync("npm", ["run", "build", "--workspace", "@tatolab/tato-app-core-views", "--", "--sourcemap"], { cwd: monorepoRoot, stdio: "ignore" });
  execFileSync("npx", ["electron-vite", "build", "--sourcemap", "--outDir", buildDirectory], { cwd: tatoAppRoot, stdio: "ignore" });
  const packageDirectories = new Set(STYLESHEET_PACKAGES.map(installedPackageDirectory));
  for (const assetsDirectory of [path.join(buildDirectory, "renderer", "assets"), path.join(buildDirectory, "renderer", "core_views", "assets")]) {
    for (const mapFile of readdirSync(assetsDirectory).filter((fileName) => fileName.endsWith(".map"))) {
      const { sources } = JSON.parse(readFileSync(path.join(assetsDirectory, mapFile), "utf8"));
      for (const source of sources) {
        const packageDirectory = packageDirectoryOf(path.resolve(assetsDirectory, source));
        if (packageDirectory !== null) packageDirectories.add(packageDirectory);
      }
    }
  }
  const notices = [...packageDirectories].sort().map((packageDirectory) => {
    const packageManifest = JSON.parse(readFileSync(path.join(packageDirectory, "package.json"), "utf8"));
    const licenceTexts = readdirSync(packageDirectory)
      .filter((fileName) => LICENCE_FILE_NAMES.test(fileName))
      .sort()
      .map((fileName) => readFileSync(path.join(packageDirectory, fileName), "utf8").trim());
    const licenceText = licenceTexts.length > 0 ? licenceTexts.join("\n\n") : `${packageManifest.license} (the package ships no licence file)`;
    return `${packageManifest.name} ${packageManifest.version} — ${packageManifest.license}\n\n${licenceText}`;
  });
  const noticesFile = path.join(tatoAppRoot, "src/renderer/public/licenses/window-third-party-notices.txt");
  writeFileSync(
    noticesFile,
    `The npm packages bundled into Tatolab's window, with their licences.\n\n${notices.join(`\n\n${"=".repeat(78)}\n\n`)}\n`,
  );
  process.stdout.write(`${notices.length} packages: ${[...packageDirectories].map((packageDirectory) => path.basename(packageDirectory)).join(", ")}\n`);
} finally {
  rmSync(buildDirectory, { recursive: true, force: true });
}
