import { fileURLToPath } from "node:url";
import { packageLintConfig } from "../package_lint_rules.js";

const REACT_IMPORTS = [{ group: ["react", "react/*", "react-dom", "react-dom/*", "@xyflow/react", "@base-ui/*", "@testing-library/react"], message: "React belongs to the surfaces: values never live in component state." }];
const EFFECT_IMPORTS = [{ group: ["effect", "effect/*", "@effect/*"], message: "The pin model and the pin services are plain TypeScript, called synchronously on each pointer event." }];

// `./node_ui`, `./node_ui_host` and `./pin_type_readings` import no library, and `./pin_types` takes
// only the generated pin types' types. The `.` entry still re-exports the decoders, which import `zod`, so it is not
// held to it yet. The pin model is pure functions over readings; the pin services keep values a surface watches.
export default [
  ...packageLintConfig(fileURLToPath(new URL(".", import.meta.url)), {
    filesThatImportNoLibrary: ["src/node_ui.ts", "src/node_ui_host.ts", "src/node_ui/**/*.ts", "src/pin_type_readings.ts"],
    filesThatImportOnlyLibraryTypes: ["src/pin_types.ts"],
  }),
  {
    files: ["src/pin_model/**/*.ts"],
    ignores: ["src/pin_model/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            ...REACT_IMPORTS,
            ...EFFECT_IMPORTS,
            { group: ["**/design_system/**", "@testing-library/*", "happy-dom"], message: "The pin model draws nothing: the DOM belongs to the surfaces and the control binder." },
            { group: ["**/tato_app_view_connection", "**/tato_app_view_connection.js", "@tatolab/tato-app-view-sdk", "**/pin_services/**"], message: "The pin model reaches no connection: a store or a surface sends what it builds." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/pin_services/**/*.ts"],
    ignores: ["src/pin_services/**/*.test.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: [...REACT_IMPORTS, ...EFFECT_IMPORTS] }] },
  },
];
