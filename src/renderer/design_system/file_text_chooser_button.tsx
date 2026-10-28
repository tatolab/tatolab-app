import { FileUp } from "lucide-react";
import { useRef } from "react";
import { ActionButton } from "./action_button";
import type { ControlDataAttributes } from "./control_data_attributes";

/**
 * "Choose file…", which opens the system's file chooser and hands over the chosen file's name and text. The file is
 * read in the window, its input emptied once read, so the page keeps no hold on the file.
 */
export function FileTextChooserButton({
  label,
  onFileTextChosen,
  onFileUnreadable,
  ...controlDataAttributes
}: {
  /** The button's accessible name, naming what the file is for, as "Choose the Signing key file". */
  label: string;
  onFileTextChosen: (fileName: string, fileText: string) => void;
  /** Why the chosen file could not be read, in the browser's words. */
  onFileUnreadable: (whyUnreadable: string) => void;
} & ControlDataAttributes) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(changeEvent) => {
          const fileInput = changeEvent.currentTarget;
          const chosenFile = fileInput.files?.[0];
          if (chosenFile === undefined) return;
          chosenFile.text().then(
            (fileText) => onFileTextChosen(chosenFile.name, fileText),
            (readFailure: unknown) => onFileUnreadable(readFailure instanceof Error ? readFailure.message : String(readFailure)),
          );
          fileInput.value = "";
        }}
      />
      <ActionButton appearance="secondary" size="small" icon={FileUp} label={label} onPressed={() => fileInputRef.current?.click()} {...controlDataAttributes}>
        Choose file…
      </ActionButton>
    </>
  );
}
