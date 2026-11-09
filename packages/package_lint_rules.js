// The lint every package under packages/ shares: a view, built in or brought by a project, reaches
// Studio only through the view SDK, so no package imports the app or another package's source.

import path from "node:path";
import tseslint from "typescript-eslint";

// What the design kit draws, Studio's window draws too, so the window's lint takes these from here.

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

/** Imports no package makes: the app, by name or by path, or another package's files by path rather than by its name. */
const IMPORTS_OUTSIDE_THE_PACKAGE = [
  { group: ["tato-app", "tato-app/*"], message: "A package never imports the app; a view reaches Studio only through @tatolab/tato-app-view-sdk." },
  { regex: String.raw`^@/`, message: "`@/` is the app's own alias; a package never imports the app." },
];

/** The lint config of the package in `packageFolder`, whose sources and tests live in `src/`. */
export function packageLintConfig(packageFolder) {
  return tseslint.config(
    { ignores: ["node_modules/**", "dist/**"] },
    {
      files: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.mjs"],
      extends: [tseslint.configs.base],
      plugins: { tatolab_package: { rules: { imports_stay_inside_the_package: importsStayInsideThePackageRule(packageFolder) } } },
      rules: {
        "tatolab_package/imports_stay_inside_the_package": "error",
        "no-console": "error",
        "no-debugger": "error",
        "no-restricted-imports": ["error", { patterns: IMPORTS_OUTSIDE_THE_PACKAGE }],
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/ban-ts-comment": "error",
      },
    },
    {
      files: ["src/kit/**/*.ts", "src/kit/**/*.tsx"],
      ignores: ["src/kit/ui/**", "src/kit/**/*.test.ts", "src/kit/**/*.test.tsx"],
      rules: {
        "no-restricted-syntax": ["error", ...DOT_INDICATOR_SELECTORS, ...SVG_CIRCLE_SELECTORS],
        "no-restricted-imports": ["error", { paths: ROUND_STATUS_ICON_IMPORTS, patterns: IMPORTS_OUTSIDE_THE_PACKAGE }],
      },
    },
    {
      files: ["src/kit/ui/**"],
      rules: { "@typescript-eslint/consistent-type-assertions": "off", "@typescript-eslint/no-non-null-assertion": "off", "@typescript-eslint/no-explicit-any": "off" },
    },
    {
      files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      rules: {
        "no-restricted-syntax": [
          "error",
          { selector: "MemberExpression[object.name=/^(test|it|describe)$/][property.name=/^(only|skip|todo)$/]", message: "No focused, skipped or todo test." },
        ],
      },
    },
  );
}
