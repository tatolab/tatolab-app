// What the New project sheet and the main process both hold a new project's name to: it becomes
// the project's folder, so it must be one folder name on macOS and Linux alike.

/** The name the New project sheet suggests, numbered from 2 where a folder already holds it. */
export const UNTITLED_PROJECT_NAME = "Untitled project";

/** The longest folder name APFS and ext4 both take, in bytes. */
const LONGEST_FOLDER_NAME_BYTES = 255;

/** Why `name` cannot be a new project's folder name, or `null` when it can. */
export function newProjectFolderNameRefusal(name: string): string | null {
  const trimmedName = name.trim();
  if (trimmedName === "") return "Give the project a name.";
  if (trimmedName.includes("/")) return "A project's name can't hold a /.";
  if (trimmedName.includes("\0")) return "A project's name can't hold a null character.";
  if (trimmedName === "." || trimmedName === "..") return "A project's name can't be . or ..";
  if (trimmedName.startsWith(".")) return "A project's name can't start with a dot, which hides its folder.";
  if (new TextEncoder().encode(trimmedName).length > LONGEST_FOLDER_NAME_BYTES) return "That name is too long for a folder.";
  return null;
}

/** The suggested name with `number` after it: `Untitled project`, then `Untitled project 2`, `3`, …. */
export function untitledProjectNameNumbered(number: number): string {
  return number <= 1 ? UNTITLED_PROJECT_NAME : `${UNTITLED_PROJECT_NAME} ${number}`;
}
