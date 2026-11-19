// Writes the kit: the one folder an extension is checked against, holding nothing that runs. It holds
// the hand-written files of `kit/`, the declarations of every module the Studio supplies with every
// declaration those name, the strict preset with a `paths` entry for each name a declaration is
// imported by, the two manifests' JSON Schemas, and a `package.json` whose `exports` are generated
// from the supplied entries of the SDK, at the SDK's version.
// The SDK's own declarations are emitted by the compiler the Studio checks itself with. Every other
// declaration is copied from the copy installed for the app, at the place it holds in its package,
// so a relative import between them still resolves. A declaration of the SDK is written with the
// extension of each relative import spelled out, as `nodenext` reads it.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, findPackageJSON } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import packageManifest from "../package.json" with { type: "json" };
import { isAnEntryOfTheSdk, isASuppliedStylesheet, SUPPLIED_MODULES, VIEW_SDK_PACKAGE_NAME, type SuppliedModule } from "../src/supplied_modules.ts";

/** The SDK's package folder. */
const VIEW_SDK_FOLDER = path.resolve(import.meta.dirname, "..");

/** The hand-written files of the kit, copied into it as they are. */
const HAND_WRITTEN_KIT_FOLDER = path.join(VIEW_SDK_FOLDER, "kit");

/** Where the build writes the kit. */
export const VIEW_SDK_KIT_FOLDER = path.join(VIEW_SDK_FOLDER, "dist", "kit");

/** The folder of the kit that holds every declaration, one folder for each package by its name. */
const DECLARATIONS_FOLDER = "declarations";

/** The compiler the Studio's own code is checked with. */
const NATIVE_TYPESCRIPT_COMPILER = path.join(path.dirname(findPackageJSON("@typescript/native", import.meta.url) ?? "@typescript/native"), "bin", "tsc");

/** The two manifests' JSON Schemas, by the name the kit holds each under. */
const MANIFEST_JSON_SCHEMAS: Readonly<Record<string, string>> = {
  "tatolab_view.schema.json": path.join(VIEW_SDK_FOLDER, "tatolab_view.schema.json"),
  "tatolab_node_ui.schema.json": createRequire(import.meta.url).resolve("@tatolab/runtime-client/node_ui_manifest.schema.json"),
};

/** How a supplied name is resolved to the declaration it reads: as the SDK's own code resolves it. */
const RESOLUTION_OPTIONS: ts.CompilerOptions = { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, noEmit: true };

/** One declaration file of the kit: where it is read from, and the package and place it is written at. */
interface KitDeclaration {
  readonly read_from: string;
  readonly package_name: string;
  readonly package_folder: string;
}

/** The kit's place of `declaration`, relative to the kit's folder, with forward slashes. */
function placeInTheKit(declaration: KitDeclaration): string {
  return path.posix.join(DECLARATIONS_FOLDER, declaration.package_name, path.relative(declaration.package_folder, declaration.read_from).split(path.sep).join("/"));
}

/** The package that holds the installed file `fileName`: the nearest folder above it whose `package.json` names one. */
function packageHoldingTheFile(fileName: string): { name: string; folder: string; module_type: string } {
  let folder = path.dirname(fileName);
  while (folder !== path.dirname(folder)) {
    const manifestFile = path.join(folder, "package.json");
    if (existsSync(manifestFile)) {
      const manifest: unknown = JSON.parse(readFileSync(manifestFile, "utf8"));
      if (typeof manifest === "object" && manifest !== null && "name" in manifest && typeof manifest.name === "string") {
        const moduleType = "type" in manifest && manifest.type === "module" ? "module" : "commonjs";
        return { name: manifest.name, folder, module_type: moduleType };
      }
    }
    folder = path.dirname(folder);
  }
  throw new Error(`${fileName} sits in no package`);
}

/** Each module specifier `sourceFile` imports, exports from, names in an `import()` type or references by path. */
function specifiersNamedBy(sourceFile: ts.SourceFile): { modules: string[]; referenced_paths: string[]; referenced_types: string[] } {
  const modules: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) modules.push(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) modules.push(node.argument.literal.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) modules.push(node.moduleReference.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { modules, referenced_paths: sourceFile.referencedFiles.map((reference) => reference.fileName), referenced_types: sourceFile.typeReferenceDirectives.map((reference) => reference.fileName) };
}

/** The declaration `specifier` resolves to from `containingFile`, or `null` where it resolves to none. */
function declarationResolvedFrom(specifier: string, containingFile: string): string | null {
  const resolved = ts.resolveModuleName(specifier, containingFile, RESOLUTION_OPTIONS, ts.sys).resolvedModule;
  if (resolved === undefined || !/\.d\.[cm]?ts$/.test(resolved.resolvedFileName)) return null;
  return resolved.resolvedFileName;
}

/** Whether `specifier` names a package rather than a file beside the one that imports it. */
function isABareSpecifier(specifier: string): boolean {
  return !specifier.startsWith(".") && !specifier.startsWith("/");
}

/** Whether `specifier` names the SDK itself or one of its entries. */
function isAnSdkName(specifier: string): boolean {
  return specifier === VIEW_SDK_PACKAGE_NAME || specifier.startsWith(`${VIEW_SDK_PACKAGE_NAME}/`);
}

/** `specifier` as `nodenext` reads a relative import of `resolvedFile` from `containingFile`: the file's place with `.js` in place of `.d.ts`. */
function relativeSpecifierWithItsExtension(containingFile: string, resolvedFile: string): string {
  const relative = path.relative(path.dirname(containingFile), resolvedFile).split(path.sep).join("/").replace(/\.d\.ts$/, ".js");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/** The SDK's own declarations, emitted by the Studio's compiler into a folder of their own. */
function emitTheSdksDeclarations(): string {
  const emitFolder = mkdtempSync(path.join(tmpdir(), "tatolab_view_sdk_declarations-"));
  execFileSync(process.execPath, [NATIVE_TYPESCRIPT_COMPILER, "-p", path.join(VIEW_SDK_FOLDER, "tsconfig.kit_declarations.json"), "--outDir", emitFolder], { cwd: VIEW_SDK_FOLDER, stdio: "pipe" });
  return emitFolder;
}

/** The source file of the SDK entry `suppliedModuleName`, as the package's `exports` name it, relative to the SDK's `src/`. */
function sourceOfTheSdkEntry(suppliedModuleName: string): string {
  const subpath = `.${suppliedModuleName.slice(VIEW_SDK_PACKAGE_NAME.length)}`;
  for (const [entry, entrySource] of Object.entries(packageManifest.exports)) {
    const [before, after] = entry.split("*");
    if (after === undefined) {
      if (entry === subpath) return path.relative("src", entrySource);
      continue;
    }
    if (before !== undefined && subpath.startsWith(before) && subpath.endsWith(after) && subpath.length >= before.length + after.length) {
      return path.relative("src", entrySource.replace("*", subpath.slice(before.length, subpath.length - after.length)));
    }
  }
  throw new Error(`supplied_modules.json lists ${suppliedModuleName}, which is not an entry of ${VIEW_SDK_PACKAGE_NAME}`);
}

/** What the walk over the supplied modules' declarations found: each file to write, and the declaration each bare name is read from. */
interface DeclarationsFound {
  readonly declarations: ReadonlyMap<string, KitDeclaration>;
  readonly declaration_of_each_name: ReadonlyMap<string, string>;
  readonly module_type_of_each_package: ReadonlyMap<string, string>;
}

/** Every declaration the supplied modules name, from each supplied module's own, by the file each is read from. */
function declarationsTheSuppliedModulesName(sdkDeclarationsFolder: string, suppliedModules: readonly SuppliedModule[]): DeclarationsFound {
  const declarations = new Map<string, KitDeclaration>();
  const declarationOfEachName = new Map<string, string>();
  const moduleTypeOfEachPackage = new Map<string, string>([[VIEW_SDK_PACKAGE_NAME, "module"]]);
  const sdkPackageFile = path.join(VIEW_SDK_FOLDER, "package.json");
  const toVisit: string[] = [];
  const nameTheDeclaration = (name: string, declaration: string): void => {
    const named = declarationOfEachName.get(name);
    if (named !== undefined && named !== declaration) throw new Error(`${name} resolves to both ${named} and ${declaration}`);
    declarationOfEachName.set(name, declaration);
  };
  const reach = (fileName: string): void => {
    if (declarations.has(fileName)) return;
    if (fileName.startsWith(sdkDeclarationsFolder + path.sep)) {
      declarations.set(fileName, { read_from: fileName, package_name: VIEW_SDK_PACKAGE_NAME, package_folder: sdkDeclarationsFolder });
    } else {
      const holder = packageHoldingTheFile(fileName);
      declarations.set(fileName, { read_from: fileName, package_name: holder.name, package_folder: holder.folder });
      moduleTypeOfEachPackage.set(holder.name, holder.module_type);
    }
    toVisit.push(fileName);
  };
  for (const suppliedModule of suppliedModules) {
    if (isASuppliedStylesheet(suppliedModule)) continue;
    const declaration = isAnEntryOfTheSdk(suppliedModule)
      ? path.join(sdkDeclarationsFolder, sourceOfTheSdkEntry(suppliedModule.name).replace(/\.tsx?$/, ".d.ts"))
      : declarationResolvedFrom(suppliedModule.name, sdkPackageFile);
    if (declaration === null || !existsSync(declaration)) throw new Error(`${suppliedModule.name} has no declaration to place in the kit`);
    nameTheDeclaration(suppliedModule.name, declaration);
    reach(declaration);
  }
  for (let fileName = toVisit.pop(); fileName !== undefined; fileName = toVisit.pop()) {
    const sourceFile = ts.createSourceFile(fileName, readFileSync(fileName, "utf8"), ts.ScriptTarget.Latest, false);
    const named = specifiersNamedBy(sourceFile);
    if (named.referenced_types.length > 0) throw new Error(`${fileName} references the types of ${named.referenced_types.join(", ")} by name, which the kit cannot place`);
    for (const referencedPath of named.referenced_paths) reach(path.resolve(path.dirname(fileName), referencedPath));
    for (const specifier of named.modules) {
      // A stylesheet is typed by the kit's one ambient declaration for `.css`.
      if (specifier.endsWith(".css")) continue;
      // An SDK declaration names an installed package's declaration through the SDK's own package, as its source did.
      const resolvedFrom = fileName.startsWith(sdkDeclarationsFolder + path.sep) && isABareSpecifier(specifier) ? sdkPackageFile : fileName;
      const resolved = isAnSdkName(specifier) ? path.join(sdkDeclarationsFolder, sourceOfTheSdkEntry(specifier).replace(/\.tsx?$/, ".d.ts")) : declarationResolvedFrom(specifier, resolvedFrom);
      if (resolved === null) continue;
      if (isABareSpecifier(specifier)) nameTheDeclaration(specifier, resolved);
      reach(resolved);
    }
  }
  return { declarations, declaration_of_each_name: declarationOfEachName, module_type_of_each_package: moduleTypeOfEachPackage };
}

/** The text of the SDK declaration `fileName` with each relative import's extension spelled out. */
function sdkDeclarationWithItsExtensions(fileName: string): string {
  const text = readFileSync(fileName, "utf8");
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false);
  const replacements: { start: number; end: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    const literal =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)
          ? node.argument.literal
          : null;
    if (literal !== null && !isABareSpecifier(literal.text)) {
      const resolved = declarationResolvedFrom(literal.text, fileName);
      if (resolved === null) throw new Error(`${fileName} imports ${literal.text}, which has no declaration`);
      replacements.push({ start: literal.getStart(sourceFile) + 1, end: literal.getEnd() - 1, text: relativeSpecifierWithItsExtension(fileName, resolved) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...replacements].sort((first, second) => second.start - first.start).reduce((written, replacement) => written.slice(0, replacement.start) + replacement.text + written.slice(replacement.end), text);
}

/** The kit's `package.json`: the SDK's name and version, ES modules, and an entry for each supplied entry of the SDK at its declaration. */
function kitPackageManifest(declarationOfEachName: ReadonlyMap<string, string>, declarations: ReadonlyMap<string, KitDeclaration>): object {
  const exportsOfTheKit: Record<string, string | { types: string }> = { "./package.json": "./package.json", "./tsconfig.preset.json": "./tsconfig.preset.json" };
  for (const suppliedModule of SUPPLIED_MODULES) {
    if (!isAnEntryOfTheSdk(suppliedModule) || isASuppliedStylesheet(suppliedModule)) continue;
    const declaration = declarationOfEachName.get(suppliedModule.name);
    const placed = declaration === undefined ? undefined : declarations.get(declaration);
    if (placed === undefined) throw new Error(`${suppliedModule.name} has no declaration in the kit`);
    exportsOfTheKit[`.${suppliedModule.name.slice(VIEW_SDK_PACKAGE_NAME.length)}`] = { types: `./${placeInTheKit(placed)}` };
  }
  return { name: VIEW_SDK_PACKAGE_NAME, version: packageManifest.version, license: packageManifest.license, type: "module", exports: exportsOfTheKit };
}

/** Writes the kit into `kitFolder`, emptied first. */
export function writeTheViewSdkKit(kitFolder: string = VIEW_SDK_KIT_FOLDER): void {
  rmSync(kitFolder, { recursive: true, force: true });
  mkdirSync(kitFolder, { recursive: true });
  cpSync(HAND_WRITTEN_KIT_FOLDER, kitFolder, { recursive: true });
  const sdkDeclarationsFolder = emitTheSdksDeclarations();
  try {
    const found = declarationsTheSuppliedModulesName(sdkDeclarationsFolder, SUPPLIED_MODULES);
    for (const declaration of found.declarations.values()) {
      const placed = path.join(kitFolder, placeInTheKit(declaration));
      mkdirSync(path.dirname(placed), { recursive: true });
      const isTheSdks = declaration.package_name === VIEW_SDK_PACKAGE_NAME;
      writeFileSync(placed, isTheSdks ? sdkDeclarationWithItsExtensions(declaration.read_from) : readFileSync(declaration.read_from));
    }
    // Each package's folder says whether its declarations are ES modules, as its own `package.json` does.
    for (const [packageName, moduleType] of found.module_type_of_each_package) {
      writeFileSync(path.join(kitFolder, DECLARATIONS_FOLDER, packageName, "package.json"), `${JSON.stringify({ type: moduleType }, null, 2)}\n`);
    }
    const preset: { compilerOptions: Record<string, unknown> } = JSON.parse(readFileSync(path.join(HAND_WRITTEN_KIT_FOLDER, "tsconfig.preset.json"), "utf8"));
    const paths: Record<string, string[]> = {};
    for (const [name, declaration] of [...found.declaration_of_each_name].sort(([first], [second]) => first.localeCompare(second))) {
      const placed = found.declarations.get(declaration);
      if (placed !== undefined) paths[name] = [`./${placeInTheKit(placed)}`];
    }
    preset.compilerOptions["paths"] = paths;
    writeFileSync(path.join(kitFolder, "tsconfig.preset.json"), `${JSON.stringify(preset, null, 2)}\n`);
    writeFileSync(path.join(kitFolder, "package.json"), `${JSON.stringify(kitPackageManifest(found.declaration_of_each_name, found.declarations), null, 2)}\n`);
    mkdirSync(path.join(kitFolder, "schemas"), { recursive: true });
    for (const [schemaName, schemaFile] of Object.entries(MANIFEST_JSON_SCHEMAS)) cpSync(schemaFile, path.join(kitFolder, "schemas", schemaName));
  } finally {
    rmSync(sdkDeclarationsFolder, { recursive: true, force: true });
  }
}
