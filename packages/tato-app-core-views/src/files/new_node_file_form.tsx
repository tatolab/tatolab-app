import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TextField } from "@tatolab/tato-app-view-sdk/design_system/text_field";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";

/** What the New node file field holds as it opens: the folder the runtime's node files usually sit in. */
const NEW_NODE_FILE_PATH_TO_START_FROM = "nodes/";

/** The New node file form under the header: a path in the open project, created from the runtime's node template and opened in Code; a refusal in the runtime's words. */
export function NewNodeFileForm({
  connection,
  projectFolder,
  onCreated,
  onClosed,
}: {
  connection: Pick<TatoAppViewConnection, "createNodeFile">;
  /** The open project's folder, absolute, which the typed path is inside. */
  projectFolder: string;
  onCreated: (file: string) => void;
  onClosed: () => void;
}) {
  const pathFieldId = useId();
  const formElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const pathField = formElement.current?.querySelector("input") ?? null;
    pathField?.focus();
    pathField?.setSelectionRange(pathField.value.length, pathField.value.length);
  }, []);
  const [pathInTheProject, setPathInTheProject] = useState(NEW_NODE_FILE_PATH_TO_START_FROM);
  const [creationRefusal, setCreationRefusal] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const typedPath = pathInTheProject.trim();
  const nothingNamedYet = typedPath === "" || typedPath.endsWith("/") ? "Name the file, as nodes/invert.py." : null;
  const createIt = () => {
    if (nothingNamedYet !== null || isCreating) return;
    setIsCreating(true);
    setCreationRefusal(null);
    void connection.createNodeFile(`${projectFolder}/${typedPath}`).then((nodeFileCreating) => {
      setIsCreating(false);
      if (nodeFileCreating.kind === "not_created") {
        setCreationRefusal(nodeFileCreating.because);
        return;
      }
      onCreated(nodeFileCreating.file);
    });
  };
  const closeUnlessCreating = () => {
    if (!isCreating) onClosed();
  };
  const answerTheKeyInTheForm = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.nativeEvent.isComposing) return;
    if (keyboardEvent.key === "Escape") closeUnlessCreating();
    if (keyboardEvent.key !== "Enter" || !(keyboardEvent.target instanceof HTMLInputElement)) return;
    keyboardEvent.preventDefault();
    createIt();
  };
  return (
    <div ref={formElement} className="shrink-0 border-b px-3 py-2" onKeyDown={answerTheKeyInTheForm} data-new-node-file-form="">
      <label htmlFor={pathFieldId} className="block pb-1 text-2xs text-fg-3">
        New node file, from the runtime's node template
      </label>
      <TextField
        id={pathFieldId}
        label="New node file"
        text={pathInTheProject}
        onTextChanged={(typedPath) => {
          setPathInTheProject(typedPath);
          setCreationRefusal(null);
        }}
        isMachineWord
        isRequired
        isRefused={creationRefusal !== null}
        placeholder="nodes/invert.py"
        className="w-full"
        data-new-node-file-path=""
      />
      <div className="flex items-center justify-end gap-2 pt-2">
        <ActionButton appearance="quiet" size="small" isDisabled={isCreating} onPressed={closeUnlessCreating} data-new-node-file-action="cancel">
          Cancel
        </ActionButton>
        {isCreating ? (
          <PendingActionWords words="Creating…" />
        ) : (
          <ActionButton appearance="primary" size="small" disabledReason={nothingNamedYet} onPressed={createIt} data-new-node-file-action="create">
            Create
          </ActionButton>
        )}
      </div>
      {creationRefusal !== null && <RefusalLine layout="under_field" lead="Didn't create the file:" words={creationRefusal} data-new-node-file-refusal="" />}
    </div>
  );
}
