// Builds the modules the Studio supplies to a view, each listed in `supplied_modules.json`, into
// `dist/studio_sdk/`: one ES module per name, at the file the import map resolves it to, beside the
// chunks they share, so a page that imports several holds one copy of what they have in common.

import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const suppliedModules: readonly { name: string; served_file: string }[] = JSON.parse(readFileSync(path.join(import.meta.dirname, "supplied_modules.json"), "utf8"));
const packageManifest: { name: string; exports: Record<string, string> } = JSON.parse(readFileSync(path.join(import.meta.dirname, "package.json"), "utf8"));

/** The source file of the package entry `suppliedModuleName` names, as the package's `exports` resolve it. */
function sourceOfThePackageEntry(suppliedModuleName: string): string {
  const entrySource = packageManifest.exports[`.${suppliedModuleName.slice(packageManifest.name.length)}`];
  if (!suppliedModuleName.startsWith(packageManifest.name) || entrySource === undefined) {
    throw new Error(`supplied_modules.json lists ${suppliedModuleName}, which is not an entry of ${packageManifest.name}`);
  }
  return path.join(import.meta.dirname, entrySource);
}

export default defineConfig({
  build: {
    outDir: path.join(import.meta.dirname, "dist", "studio_sdk"),
    emptyOutDir: true,
    lib: {
      entry: Object.fromEntries(suppliedModules.map((suppliedModule) => [suppliedModule.served_file.replace(/\.js$/, ""), sourceOfThePackageEntry(suppliedModule.name)])),
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rolldownOptions: { output: { chunkFileNames: "chunks/[name]-[hash].js" } },
  },
});
