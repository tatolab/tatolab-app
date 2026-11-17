import { fileURLToPath } from "node:url";
import { packageLintConfig } from "../package_lint_rules.js";

// `./node_ui` and `./node_ui_host` import no library, and `./pin_types` takes only the generated
// pin types' types. The `.` entry still re-exports the decoders, which import `zod`, so it is not
// held to it yet.
export default packageLintConfig(fileURLToPath(new URL(".", import.meta.url)), {
  filesThatImportNoLibrary: ["src/node_ui.ts", "src/node_ui_host.ts", "src/node_ui/**/*.ts"],
  filesThatImportOnlyLibraryTypes: ["src/pin_types.ts"],
});
