// Builds the modules the Studio supplies to a view, each listed in `supplied_modules.json`, into
// `dist/studio_sdk/`: one ES module per name, at the file the import map resolves it to, beside the
// chunks they share, so a page that imports several holds one copy of what they have in common.

import path from "node:path";
import { defineConfig } from "vite";
import packageManifest from "./package.json" with { type: "json" };
import { SUPPLIED_MODULES } from "./src/supplied_modules.ts";

/** Each entry of the package, by the name a view imports it with, to its source file. */
const SOURCE_OF_EACH_PACKAGE_ENTRY: ReadonlyMap<string, string> = new Map(
  Object.entries(packageManifest.exports).map(([entry, entrySource]) => [`${packageManifest.name}${entry.slice(1)}`, path.join(import.meta.dirname, entrySource)]),
);

/** The source file of the package entry `suppliedModuleName` names, as the package's `exports` resolve it. */
function sourceOfThePackageEntry(suppliedModuleName: string): string {
  const entrySource = SOURCE_OF_EACH_PACKAGE_ENTRY.get(suppliedModuleName);
  if (entrySource === undefined) throw new Error(`supplied_modules.json lists ${suppliedModuleName}, which is not an entry of ${packageManifest.name}`);
  return entrySource;
}

/** The name of each supplied module's build entry: its served file without `.js`, which `fileName` writes back as that file. */
function buildEntryNameOf(servedFile: string): string {
  return servedFile.replace(/\.js$/, "");
}

export default defineConfig({
  build: {
    outDir: path.join(import.meta.dirname, "dist", "studio_sdk"),
    emptyOutDir: true,
    lib: {
      entry: Object.fromEntries(SUPPLIED_MODULES.map((suppliedModule) => [buildEntryNameOf(suppliedModule.served_file), sourceOfThePackageEntry(suppliedModule.name)])),
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rolldownOptions: { output: { chunkFileNames: "chunks/[name]-[hash].js" } },
  },
});
