import type { ListedStream } from "../../shared/tatolab_backend_contract";

/** What the rename dialog says above its field. */
export interface StreamRenameDialogPresentation {
  title: string;
  description: string;
}

/** The rename dialog for `stream`, named by the display name it has now. */
export function presentStreamRenameDialog(stream: ListedStream): StreamRenameDialogPresentation {
  return {
    title: `Rename ${stream.display_name}`,
    description: "Its address stays the same.",
  };
}

/** The display name a rename sends: the typed name without the spaces around it. */
export function displayNameToRenameTo(typedDisplayName: string): string {
  return typedDisplayName.trim();
}

/** Whether Rename can be pressed: the typed name shows something, and is not the name the stream has now. */
export function canRenameStreamTo(stream: ListedStream, typedDisplayName: string): boolean {
  const displayName = displayNameToRenameTo(typedDisplayName);
  return displayName !== "" && displayName !== stream.display_name;
}
