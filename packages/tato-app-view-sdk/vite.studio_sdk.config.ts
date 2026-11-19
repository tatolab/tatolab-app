// Builds the modules the Studio supplies to a view, each listed in `supplied_modules.json`, into
// `dist/studio_sdk/`, at the file the import map resolves its name to: one ES module for each entry
// of the SDK and each part of its design system, one for each library an extension may import, and
// one stylesheet for each supplied stylesheet, the design system's compiled by Tailwind. Every module
// is built in this one build, beside the chunks they share, so a page that imports several holds one
// copy of what they have in common: a design system part and an extension that imports `react` meet
// the same React.
// A library is built from the copy installed for the app. React and React DOM are published as
// CommonJS only, so each is supplied through an ES module that names every export the library's
// module object holds.
// A supplied module listed as importing no library fails the build when its file, or a chunk it
// imports, holds code from any package.

import { createRequire, findPackageJSON } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin, type Rolldown } from "vite";
import packageManifest from "./package.json" with { type: "json" };
import { isAnEntryOfTheSdk, isASuppliedStylesheet, SUPPLIED_MODULES, type SuppliedModule } from "./src/supplied_modules.ts";

const requireFromThePackage = createRequire(import.meta.url);

/** Each entry of the package, by the name a view imports it with, to its source file; a `*` in an entry stands for one file name. */
const EACH_PACKAGE_ENTRY: readonly { name: RegExp; source: string }[] = Object.entries(packageManifest.exports).map(([entry, entrySource]) => ({
  name: new RegExp(`^${`${packageManifest.name}${entry.slice(1)}`.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&").replace("*", "([a-z0-9_.]+)")}$`),
  source: entrySource,
}));

/** The source file of the package entry `suppliedModuleName` names, as the package's `exports` resolve it. */
export function sourceOfThePackageEntry(suppliedModuleName: string): string {
  for (const entry of EACH_PACKAGE_ENTRY) {
    const matched = entry.name.exec(suppliedModuleName);
    if (matched !== null) return path.join(import.meta.dirname, entry.source.replace("*", matched[1] ?? ""));
  }
  throw new Error(`supplied_modules.json lists ${suppliedModuleName}, which is not an entry of ${packageManifest.name}`);
}

/** The prefix of the module id that stands for the ES module through which a library is supplied. */
const SUPPLIED_LIBRARY_ID_PREFIX = "\0supplied_library:";

/** Whether the installed file `libraryFile` is CommonJS: a `.cjs`, or a `.js` whose package is not marked as ES modules. */
function isCommonJs(libraryFile: string): boolean {
  if (libraryFile.endsWith(".cjs")) return true;
  if (libraryFile.endsWith(".mjs")) return false;
  const libraryPackageFile = findPackageJSON(pathToFileURL(libraryFile));
  if (libraryPackageFile === undefined) return true;
  const libraryPackage: { type?: string } = requireFromThePackage(libraryPackageFile);
  return libraryPackage.type !== "module";
}

/** Whether `exportName` can be written as a named export. */
function isANameableExport(exportName: string): boolean {
  return exportName !== "default" && /^[A-Za-z_$][\w$]*$/.test(exportName);
}

/** The ES module through which the installed library `libraryName` is supplied: its own module, or one naming each export of a CommonJS module's object. */
function moduleSupplyingTheLibrary(libraryName: string): string {
  const libraryFile = requireFromThePackage.resolve(libraryName);
  if (!isCommonJs(libraryFile)) return `export * from ${JSON.stringify(libraryFile)};\n`;
  const libraryExports: object = requireFromThePackage(libraryName);
  const exportNames = Object.keys(libraryExports).filter(isANameableExport);
  return [`import library from ${JSON.stringify(libraryFile)};`, "export default library;", `export const { ${exportNames.join(", ")} } = library;`, ""].join("\n");
}

/** Supplies each library through the ES module `moduleSupplyingTheLibrary` writes for it. */
function librariesSuppliedAsEsModules(): Plugin {
  return {
    name: "libraries_supplied_as_es_modules",
    resolveId: (moduleId) => (moduleId.startsWith(SUPPLIED_LIBRARY_ID_PREFIX) ? moduleId : null),
    load: (moduleId) => (moduleId.startsWith(SUPPLIED_LIBRARY_ID_PREFIX) ? moduleSupplyingTheLibrary(moduleId.slice(SUPPLIED_LIBRARY_ID_PREFIX.length)) : null),
  };
}

/** The module the build starts `suppliedModule` from: a source of the SDK, or the ES module that supplies a library. */
function buildInputOf(suppliedModule: SuppliedModule): string {
  return isAnEntryOfTheSdk(suppliedModule) ? sourceOfThePackageEntry(suppliedModule.name) : `${SUPPLIED_LIBRARY_ID_PREFIX}${suppliedModule.name}`;
}

/** The name of `suppliedModule`'s build input: its served file without its extension, which the output names write back as that file. */
export function buildInputNameOf(suppliedModule: SuppliedModule): string {
  return suppliedModule.served_file.replace(/\.(js|css)$/, "");
}

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
        const libraryModules = modulesOfTheChunkAndWhatItImports(bundle, suppliedModule.served_file).filter((moduleId) => moduleId.includes(`${path.sep}node_modules${path.sep}`));
        if (libraryModules.length > 0) this.error(`${suppliedModule.name} imports no library, but its built file holds ${libraryModules.join(", ")}`);
      }
    },
  };
}

/** The served file of each supplied stylesheet, by the source file it is built from. */
const SERVED_STYLESHEET_BY_SOURCE: ReadonlyMap<string, string> = new Map(
  SUPPLIED_MODULES.filter(isASuppliedStylesheet).map((suppliedStylesheet) => [buildInputOf(suppliedStylesheet), suppliedStylesheet.served_file]),
);

/** Where a file the build emits beside the modules is written: a supplied stylesheet at its served file, anything else, a font or a stylesheet a chunk loads, under `assets/`. */
function fileNameOfAnEmittedAsset(asset: Rolldown.PreRenderedAsset): string {
  const servedStylesheet = asset.originalFileNames.map((originalFileName) => SERVED_STYLESHEET_BY_SOURCE.get(path.resolve(import.meta.dirname, originalFileName))).find((served) => served !== undefined);
  return servedStylesheet ?? "assets/[name]-[hash][extname]";
}

export default defineConfig({
  // A stylesheet's fonts and a chunk's lazily loaded files resolve against the file that names them, wherever the Studio serves the folder.
  base: "./",
  plugins: [tailwindcss(), librariesSuppliedAsEsModules(), suppliedModulesThatImportNoLibraryHoldNone()],
  // The supplied React is its production build, whatever run builds it, the development app's included.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  oxc: { jsx: { runtime: "automatic", development: false } },
  build: {
    outDir: path.join(import.meta.dirname, "dist", "studio_sdk"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    // Monaco, loaded only as a code editor opens, is the one chunk of several megabytes.
    chunkSizeWarningLimit: 4096,
    rolldownOptions: {
      // The design system's libraries mark their modules `"use client"`, which means nothing outside a server-rendering framework.
      onwarn: (warning, warn) => (warning.code === "MODULE_LEVEL_DIRECTIVE" ? undefined : warn(warning)),
      input: Object.fromEntries(SUPPLIED_MODULES.map((suppliedModule) => [buildInputNameOf(suppliedModule), buildInputOf(suppliedModule)])),
      // Each entry keeps every export it declares, so an extension imports by name what the SDK's entry exports.
      preserveEntrySignatures: "strict",
      output: { format: "es", entryFileNames: "[name].js", chunkFileNames: "chunks/[name]-[hash].js", assetFileNames: fileNameOfAnEmittedAsset },
    },
  },
});
