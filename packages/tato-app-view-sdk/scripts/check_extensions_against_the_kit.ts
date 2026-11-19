// Checks each extension folder of the named projects against the kit, as the app's build does over
// the core projects of the runtime unit it carries: streamlib's build has no kit, so this is the only
// check of a core project's `.ts` before a release. Prints what each check found, and fails when any
// extension fails.
//
// Usage: node scripts/check_extensions_against_the_kit.ts <project folder>...
import { checkAnExtensionFolder, extensionFoldersOfAProject } from "./extension_check.ts";

const projectFolders = process.argv.slice(2);
if (projectFolders.length === 0) {
  process.stderr.write("usage: node scripts/check_extensions_against_the_kit.ts <project folder>...\n");
  process.exit(2);
}
let everyExtensionPassed = true;
for (const projectFolder of projectFolders) {
  for (const extensionFolder of extensionFoldersOfAProject(projectFolder)) {
    const answer = checkAnExtensionFolder(extensionFolder);
    everyExtensionPassed &&= answer.passed;
    process.stdout.write(`${answer.passed ? "passed" : "failed"}: ${extensionFolder}\n`);
    for (const warning of answer.warnings) process.stdout.write(`  warning: ${warning}\n`);
    const printed = [answer.compiler_printed, answer.linter_printed].filter((text) => !answer.passed && text.trim() !== "");
    for (const text of printed) process.stdout.write(`${text.trimEnd()}\n`);
  }
}
process.exit(everyExtensionPassed ? 0 : 1);
