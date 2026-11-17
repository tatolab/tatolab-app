import { fileURLToPath } from "node:url";
import { packageLintConfig } from "../package_lint_rules.js";

// `./pin_types` and `./node_ui` import no library; the generated pin types import nothing. The `.`
// entry still re-exports the decoders, which import `zod`, so it is not held to it yet.
export default packageLintConfig(fileURLToPath(new URL(".", import.meta.url)), {
  filesThatImportNoLibrary: ["src/pin_types.ts", "src/node_ui.ts", "src/node_ui/**/*.ts"],
  allowedLibraryImports: ["@tatolab/runtime-client/pin_types"],
});
