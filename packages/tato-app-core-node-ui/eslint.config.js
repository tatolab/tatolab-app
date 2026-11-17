import { fileURLToPath } from "node:url";
import { packageLintConfig } from "../package_lint_rules.js";

// `node_ui/` is served to a page as a project's extension is, so it imports only its own files and
// the modules the Studio supplies; the tests beside it import what they need.
export default packageLintConfig(fileURLToPath(new URL(".", import.meta.url)), { sourceFolders: ["node_ui", "tests"], extensionFolder: "node_ui" });
