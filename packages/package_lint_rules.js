// The lint every package under packages/ shares: a view, built in or brought by a project, reaches
// Studio only through the view SDK, so no package imports the app or another package's source.

import path from "node:path";
import tseslint from "typescript-eslint";

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
