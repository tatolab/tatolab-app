import { fileURLToPath } from "node:url";
import { packageLintConfig } from "../package_lint_rules.js";

export default packageLintConfig(fileURLToPath(new URL(".", import.meta.url)));
