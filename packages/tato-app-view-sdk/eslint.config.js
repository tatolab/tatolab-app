import { fileURLToPath } from "node:url";
import { packageLintConfig } from "../package_lint_rules.js";

const REACT_IMPORTS = [{ group: ["react", "react/*", "react-dom", "react-dom/*", "@xyflow/react", "@base-ui/*", "@testing-library/react"], message: "React belongs to the surfaces: values never live in component state." }];
const EFFECT_IMPORTS = [{ group: ["effect", "effect/*", "@effect/*"], message: "The pin model and the pin services are plain TypeScript, called synchronously on each pointer event." }];

const STUDIO_HOST_IMPORTS = [
  { group: ["**/studio_host", "**/studio_host.js", "**/studio_host/**", "@tatolab/tato-app-view-sdk/studio_host"], message: "The SDK's public side never reaches its Studio side: an author would receive the Studio's Schemas and the library under them." },
];

// The public entries an author imports, and the files they are built from, import no library:
// `./pin_types` and `./studio_readings` take only the runtime client's generated types. None of them
// reaches `./studio_host`, the Studio's own side. The pin model is pure functions over readings; the
// pin services keep values a surface watches.
const PUBLIC_FILES_THAT_IMPORT_NO_LIBRARY = [
  "src/index.ts",
  "src/port_families.ts",
  "src/tato_app_view_connection.ts",
  "src/tatolab_view_manifest.ts",
  "src/view_settings.ts",
  "src/view_wire_messages.ts",
  "src/node_ui.ts",
  "src/node_ui_host.ts",
  "src/node_ui/**/*.ts",
  "src/pin_type_readings.ts",
];
const PUBLIC_FILES_THAT_IMPORT_ONLY_LIBRARY_TYPES = ["src/pin_types.ts", "src/studio_readings.ts"];

export default [
  ...packageLintConfig(fileURLToPath(new URL(".", import.meta.url)), {
    filesThatImportNoLibrary: PUBLIC_FILES_THAT_IMPORT_NO_LIBRARY,
    filesThatImportOnlyLibraryTypes: PUBLIC_FILES_THAT_IMPORT_ONLY_LIBRARY_TYPES,
  }),
  {
    files: [...PUBLIC_FILES_THAT_IMPORT_NO_LIBRARY, ...PUBLIC_FILES_THAT_IMPORT_ONLY_LIBRARY_TYPES],
    ignores: ["src/**/*.test.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: STUDIO_HOST_IMPORTS }] },
  },
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
