// The lint every package under packages/ shares: a view, built in or brought by a project, reaches
// Studio only through the view SDK, so no package imports the app or another package's source.

import path from "node:path";
import { tatolabTypeScriptLintConfig } from "@tatolab/lint-config/eslint";
import tseslint from "typescript-eslint";

// What the design system draws, Studio's window draws too, so the window's lint takes these from here.

const SMALL_SIZE = String.raw`(0\.5|1|1\.5|2|2\.5|3)`;

/** Selectors matched against string literals, template literals and JSX text, with the message each reports. */
const stringPatterns = (regexSource, message) => [
  { selector: `Literal[value=/${regexSource}/]`, message },
  { selector: `TemplateElement[value.raw=/${regexSource}/]`, message },
  { selector: `JSXText[value=/${regexSource}/]`, message },
];

const DOT_MESSAGE = "A small rounded-full element is a dot. Status is a word, and a problem is an icon.";

export const DOT_INDICATOR_SELECTORS = [
  ...stringPatterns(String.raw`rounded-full[^"\x60]*\bsize-${SMALL_SIZE}\b|\bsize-${SMALL_SIZE}\b[^"\x60]*rounded-full`, DOT_MESSAGE),
  ...stringPatterns(String.raw`^(?=.*rounded-full)(?=.*\bw-${SMALL_SIZE}\b)(?=.*\bh-${SMALL_SIZE}\b)`, DOT_MESSAGE),
  { selector: String.raw`CallExpression:has(> Literal[value=/\brounded-full\b/]):has(> Literal[value=/\bsize-${SMALL_SIZE}\b/])`, message: DOT_MESSAGE },
  { selector: String.raw`CallExpression:has(> Literal[value=/\brounded-full\b/]):has(> Literal[value=/\bw-${SMALL_SIZE}\b/]):has(> Literal[value=/\bh-${SMALL_SIZE}\b/])`, message: DOT_MESSAGE },
  ...stringPatterns(String.raw`animate-(ping|pulse|breathe)`, "No pulsing indicators."),
  ...stringPatterns("[•●◉⬤]", "No bullet glyphs."),
];
export const SVG_CIRCLE_SELECTORS = [
  { selector: "JSXOpeningElement[name.name='circle']", message: "No SVG circle in UI markup: it reads as a dot." },
  ...stringPatterns(String.raw`<circle\b`, "No SVG circle in UI markup: it reads as a dot."),
];
const ROUND_STATUS_ICONS = ["OctagonX", "OctagonAlert", "CircleX", "XCircle", "CircleAlert", "AlertCircle", "CircleDot", "CircleSlash", "CirclePlay", "CirclePause", "CircleStop"];
export const ROUND_STATUS_ICON_IMPORTS = [
  { name: "lucide-react", importNames: ROUND_STATUS_ICONS, message: "A round status icon reads as a dot: use TriangleAlert or SquareX." },
];

/** A rule refusing a relative import that leaves `packageFolder`: another package is imported by its name, and the app never. */
function importsStayInsideThePackageRule(packageFolder) {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      const refuseWhenOutside = (node, importedFrom) => {
        if (typeof importedFrom !== "string" || !importedFrom.startsWith(".")) return;
        const resolved = path.resolve(path.dirname(context.filename), importedFrom);
        const fromThePackage = path.relative(packageFolder, resolved);
        if (fromThePackage.startsWith("..") || path.isAbsolute(fromThePackage)) {
          context.report({ node, message: `${importedFrom} leaves this package; another package is imported by its name, and the app never.` });
        }
      };
      return {
        ImportDeclaration: (node) => refuseWhenOutside(node.source, node.source.value),
        ExportNamedDeclaration: (node) => node.source && refuseWhenOutside(node.source, node.source.value),
        ExportAllDeclaration: (node) => refuseWhenOutside(node.source, node.source.value),
        ImportExpression: (node) => node.source.type === "Literal" && refuseWhenOutside(node.source, node.source.value),
      };
    },
  };
}

/**
 * A rule refusing any import but a relative one: a file of an entry that imports no library pulls in
 * no library's code or types. With `libraryTypesOnly`, a type-only import of a library is taken, so
 * the file names a library's types and no code of it reaches a build.
 */
const importsNoLibraryRule = {
  meta: { type: "problem", schema: [{ type: "object", properties: { libraryTypesOnly: { type: "boolean" } }, additionalProperties: false }] },
  create(context) {
    const libraryTypesOnly = context.options[0]?.libraryTypesOnly === true;
    const refuseALibrary = (node, importedFrom, typeOnly) => {
      if (typeof importedFrom !== "string" || importedFrom.startsWith(".") || (libraryTypesOnly && typeOnly)) return;
      context.report({
        node,
        message: libraryTypesOnly
          ? `${importedFrom} is a library, and this entry takes only its types: import it with \`import type\` or \`export type\`.`
          : `${importedFrom} is a library, and this entry imports none: an author would receive its code and its types.`,
      });
    };
    const everySpecifierIsAType = (node) => node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier.importKind === "type" || specifier.exportKind === "type");
    return {
      ImportDeclaration: (node) => refuseALibrary(node.source, node.source.value, node.importKind === "type" || everySpecifierIsAType(node)),
      ExportNamedDeclaration: (node) => node.source && refuseALibrary(node.source, node.source.value, node.exportKind === "type" || everySpecifierIsAType(node)),
      ExportAllDeclaration: (node) => refuseALibrary(node.source, node.source.value, node.exportKind === "type"),
      ImportExpression: (node) => node.source.type === "Literal" && refuseALibrary(node.source, node.source.value, false),
      TSImportType: (node) => {
        const importedFrom = node.source ?? node.argument?.literal ?? node.argument;
        if (importedFrom?.type === "Literal") refuseALibrary(importedFrom, importedFrom.value, true);
      },
    };
  },
};

/** Imports no package makes: the app, by name or by path, or another package's files by path rather than by its name. */
const IMPORTS_OUTSIDE_THE_PACKAGE = [
  { group: ["tato-app", "tato-app/*"], message: "A package never imports the app; a view reaches Studio only through @tatolab/tato-app-view-sdk." },
  { regex: String.raw`^@/`, message: "`@/` is the app's own alias; a package never imports the app." },
];

const PACKAGE_LINTED_FILES = ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.mjs"];

/**
 * The lint config of the package in `packageFolder`, whose sources and tests live in `src/`.
 * `filesThatImportNoLibrary` import only each other; `filesThatImportOnlyLibraryTypes` may also
 * take a library's types, and none of its code.
 */
export function packageLintConfig(packageFolder, { filesThatImportNoLibrary = [], filesThatImportOnlyLibraryTypes = [] } = {}) {
  return tseslint.config(
    { ignores: ["node_modules/**", "dist/**"] },
    ...tatolabTypeScriptLintConfig({ files: PACKAGE_LINTED_FILES, testFiles: ["src/**/*.test.ts", "src/**/*.test.tsx"] }),
    {
      files: PACKAGE_LINTED_FILES,
      plugins: { tatolab_package: { rules: { imports_stay_inside_the_package: importsStayInsideThePackageRule(packageFolder), imports_no_library: importsNoLibraryRule } } },
      rules: {
        "tatolab_package/imports_stay_inside_the_package": "error",
        "no-restricted-imports": ["error", { patterns: IMPORTS_OUTSIDE_THE_PACKAGE }],
      },
    },
    {
      files: ["src/design_system/**/*.ts", "src/design_system/**/*.tsx"],
      ignores: ["src/design_system/ui/**", "src/design_system/**/*.test.ts", "src/design_system/**/*.test.tsx"],
      rules: {
        "no-restricted-syntax": ["error", ...DOT_INDICATOR_SELECTORS, ...SVG_CIRCLE_SELECTORS],
        "no-restricted-imports": ["error", { paths: ROUND_STATUS_ICON_IMPORTS, patterns: IMPORTS_OUTSIDE_THE_PACKAGE }],
      },
    },
    ...(filesThatImportNoLibrary.length === 0 ? [] : [{ files: filesThatImportNoLibrary, ignores: ["**/*.test.ts"], rules: { "tatolab_package/imports_no_library": "error" } }]),
    ...(filesThatImportOnlyLibraryTypes.length === 0
      ? []
      : [{ files: filesThatImportOnlyLibraryTypes, ignores: ["**/*.test.ts"], rules: { "tatolab_package/imports_no_library": ["error", { libraryTypesOnly: true }] } }]),
  );
}
