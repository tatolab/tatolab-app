// Builds the modules the Studio supplies to a view, each listed in `supplied_modules.json`, into
// `dist/studio_sdk/`: one ES module per name, at the file the import map resolves it to, beside the
// chunks they share, so a page that imports several holds one copy of what they have in common.
// A supplied module listed as importing no library fails the build when its file, or a chunk it
// imports, holds code from any package but the generated pin types.

import path from "node:path";
import { defineConfig, type Plugin, type Rolldown } from "vite";
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

/** The one package file a module that imports no library may hold: the generated pin types, which import nothing. */
const GENERATED_PIN_TYPES_FILE = path.join("node_modules", "@tatolab", "runtime-client", "pin_types.js");

/** Each module the chunk `fileName` of `bundle` holds, with every module of the chunks it imports. */
function modulesOfTheChunkAndWhatItImports(bundle: Rolldown.OutputBundle, fileName: string, visitedFileNames = new Set<string>()): string[] {
  const chunk = bundle[fileName];
  if (chunk === undefined || chunk.type !== "chunk" || visitedFileNames.has(fileName)) return [];
  visitedFileNames.add(fileName);
  return [...chunk.moduleIds, ...[...chunk.imports, ...chunk.dynamicImports].flatMap((importedFileName) => modulesOfTheChunkAndWhatItImports(bundle, importedFileName, visitedFileNames))];
}

/** Fails the build when a supplied module listed as importing no library holds a library's code. */
function suppliedModulesThatImportNoLibraryHoldNone(): Plugin {
  return {
    name: "supplied_modules_that_import_no_library_hold_none",
    generateBundle(_options, bundle) {
      for (const suppliedModule of SUPPLIED_MODULES.filter((listed) => listed.imports_no_library)) {
        const libraryModules = modulesOfTheChunkAndWhatItImports(bundle, suppliedModule.served_file).filter(
          (moduleId) => moduleId.includes(`${path.sep}node_modules${path.sep}`) && !moduleId.endsWith(`${path.sep}${GENERATED_PIN_TYPES_FILE}`),
        );
        if (libraryModules.length > 0) this.error(`${suppliedModule.name} imports no library, but its built file holds ${libraryModules.join(", ")}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [suppliedModulesThatImportNoLibraryHoldNone()],
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
