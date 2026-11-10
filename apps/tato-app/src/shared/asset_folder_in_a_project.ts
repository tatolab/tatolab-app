// The folder of a project an imported asset goes in, as the window names it: `/`-separated and relative to
// the project's folder, `""` for its top.

/** Why `intoFolder` cannot hold an imported asset, or `null` when it can: a `/`-separated folder inside the project, `""` for its top. */
export function assetFolderRefusal(intoFolder: string): string | null {
  if (intoFolder === "") return null;
  const folderNames = intoFolder.split("/");
  const isInsideTheProject = !intoFolder.startsWith("/") && !intoFolder.includes("\\") && folderNames.every((folderName) => folderName !== "" && folderName !== "." && folderName !== "..");
  return isInsideTheProject ? null : `${intoFolder} is not a folder inside the project.`;
}
