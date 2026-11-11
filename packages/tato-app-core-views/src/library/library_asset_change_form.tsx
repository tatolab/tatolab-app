// The Library's Rename, Move and Delete of an asset: a form at the top of the asset's details that asks the
// runtime's `relocate_asset` or `delete_asset` through the view's connection and closes once the runtime has
// changed the project. It sits in the panel, not over it, since a view's dialog is held to the view's area.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { TatoAppViewConnection, ViewAskDone } from "@tatolab/tato-app-view-sdk";
import type { ProjectAsset } from "@tatolab/tato-app-view-sdk/studio_readings";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TextField } from "@tatolab/tato-app-view-sdk/design_system/text_field";
import { assetFileName, assetFileNameRefusal, assetFolderOf, assetFolderRefusal, assetPathMoved, assetPathRenamed } from "./library_assets_of_the_listing";

/** Which change of an asset the Library asks for: a new name in its folder, another folder under its name, or no longer tracking it. */
export type LibraryAssetChange = "rename" | "move" | "delete";

/** The words of each change's form: its title, what it does, the field it asks for, its action and what it says while it runs. */
const LIBRARY_ASSET_CHANGE_WORDS: Record<LibraryAssetChange, { title: string; description: string; fieldLabel: string; actionWords: string; pendingWords: string; refusalLead: string }> = {
  rename: {
    title: "Rename asset",
    description: "The file takes the new name in the folder it sits in. Nodes that read it keep reading it, since the asset keeps its UUID.",
    fieldLabel: "Name",
    actionWords: "Rename",
    pendingWords: "Renaming…",
    refusalLead: "The asset wasn't renamed:",
  },
  move: {
    title: "Move asset",
    description: "The file moves to the folder under the name it has, the folder made when it is missing. Leave it empty for the project's top folder.",
    fieldLabel: "Folder",
    actionWords: "Move",
    pendingWords: "Moving…",
    refusalLead: "The asset wasn't moved:",
  },
  delete: {
    title: "Delete asset",
    description: "and its record leave the project. Undo brings the record back, but not the file's bytes.",
    fieldLabel: "",
    actionWords: "Delete",
    pendingWords: "Deleting…",
    refusalLead: "The asset wasn't deleted:",
  },
};

function RenameOrMoveTheAssetFields({ change, asset, typedText, onTextTyped }: { change: "rename" | "move"; asset: ProjectAsset; typedText: string; onTextTyped: (text: string) => void }) {
  const fieldId = useId();
  const words = LIBRARY_ASSET_CHANGE_WORDS[change];
  const pathItLandsAt = change === "rename" ? assetPathRenamed(asset.path, typedText) : assetPathMoved(asset.path, typedText);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-xs text-fg-2">
        {words.fieldLabel}
      </label>
      <TextField id={fieldId} label={words.fieldLabel} text={typedText} onTextChanged={onTextTyped} isMachineWord isRequired={change === "rename"} data-library-asset-change-field="" />
      <span className="truncate font-mono text-xs text-fg-3" title={pathItLandsAt} data-library-asset-change-lands-at="">
        {pathItLandsAt}
      </span>
    </div>
  );
}

/** The form for `change` of `asset` in the project in `projectFolder`: Rename and Move ask for a name or a folder, Delete asks to be sure; it closes once the runtime has made the change, or on Escape or Cancel. */
export function LibraryAssetChangeForm({
  change,
  asset,
  projectFolder,
  connection,
  onClosed,
}: {
  change: LibraryAssetChange;
  asset: ProjectAsset;
  projectFolder: string;
  connection: Pick<TatoAppViewConnection, "relocateAssetInTheProject" | "deleteAssetFromTheProject">;
  onClosed: () => void;
}) {
  const words = LIBRARY_ASSET_CHANGE_WORDS[change];
  const [typedText, setTypedText] = useState(change === "rename" ? assetFileName(asset.path) : change === "move" ? assetFolderOf(asset.path) : "");
  const [changeRefusal, setChangeRefusal] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const fieldRefusal = change === "rename" ? assetFileNameRefusal(typedText) : change === "move" ? assetFolderRefusal(typedText) : null;
  const pathItLandsAt = change === "rename" ? assetPathRenamed(asset.path, typedText) : change === "move" ? assetPathMoved(asset.path, typedText) : null;
  const changeIt = () => {
    if (fieldRefusal !== null || isChanging) return;
    if (pathItLandsAt === asset.path) {
      onClosed();
      return;
    }
    setIsChanging(true);
    setChangeRefusal(null);
    const asking: Promise<ViewAskDone> =
      pathItLandsAt === null ? connection.deleteAssetFromTheProject(projectFolder, asset.asset) : connection.relocateAssetInTheProject(projectFolder, asset.asset, pathItLandsAt);
    void asking.then((done) => {
      if (done.kind === "done") {
        onClosed();
        return;
      }
      setIsChanging(false);
      setChangeRefusal(done.because);
    });
  };
  const formElement = useRef<HTMLElement>(null);
  useEffect(() => {
    const field = formElement.current?.querySelector("input") ?? null;
    if (field !== null) field.select();
    else formElement.current?.querySelector<HTMLButtonElement>('[data-library-asset-change-action="cancel"]')?.focus();
  }, []);
  const changeOrCloseOnTheKey = (keyboardEvent: KeyboardEvent<HTMLElement>) => {
    if (keyboardEvent.nativeEvent.isComposing) return;
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      onClosed();
      return;
    }
    if (keyboardEvent.key !== "Enter" || !(keyboardEvent.target instanceof HTMLInputElement)) return;
    keyboardEvent.preventDefault();
    changeIt();
  };
  return (
    <section ref={formElement} aria-label={words.title} className="flex flex-col gap-2 border-b px-4 py-3" onKeyDown={changeOrCloseOnTheKey} data-library-asset-change-form={change}>
      <h3 className="text-sm font-medium text-fg">{words.title}</h3>
      <p className="text-xs text-fg-3">{change === "delete" ? `${assetFileName(asset.path)} ${words.description}` : words.description}</p>
      {change !== "delete" && (
        <RenameOrMoveTheAssetFields
          change={change}
          asset={asset}
          typedText={typedText}
          onTextTyped={(text) => {
            setTypedText(text);
            setChangeRefusal(null);
          }}
        />
      )}
      {fieldRefusal !== null && typedText.trim() !== "" && (
        <p className="text-xs text-fg-3" data-library-asset-change-field-refusal="">
          {fieldRefusal}
        </p>
      )}
      {changeRefusal !== null && (
        <div data-library-asset-change-refusal="">
          <RefusalLine lead={words.refusalLead} words={changeRefusal} />
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <ActionButton appearance="quiet" onPressed={onClosed} data-library-asset-change-action="cancel">
          Cancel
        </ActionButton>
        {isChanging ? (
          <PendingActionWords words={words.pendingWords} />
        ) : (
          <ActionButton appearance={change === "delete" ? "destructive" : "primary"} disabledReason={fieldRefusal} onPressed={changeIt} data-library-asset-change-action={change}>
            {words.actionWords}
          </ActionButton>
        )}
      </div>
    </section>
  );
}
