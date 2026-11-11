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

type LibraryAssetChangeWords = { title: string; actionWords: string; pendingWords: string; refusalLead: string };

/** The words of Rename's and Move's forms: what each does and the field it asks for, beside its title and action. */
const RELOCATE_ASSET_WORDS: Record<"rename" | "move", LibraryAssetChangeWords & { description: string; fieldLabel: string }> = {
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
};

/** The words of Delete's form. */
const DELETE_ASSET_WORDS: LibraryAssetChangeWords & { descriptionOf: (fileName: string) => string } = {
  title: "Delete asset",
  descriptionOf: (fileName) => `${fileName} and its record leave the project.`,
  actionWords: "Delete",
  pendingWords: "Deleting…",
  refusalLead: "The asset wasn't deleted:",
};

/** The form for `change` of `asset` in the project in `projectFolder`: Rename and Move ask for a name or a folder, Delete asks to be sure; it closes once the runtime has made the change, or on Escape or Cancel while nothing is asked. */
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
  const fieldId = useId();
  const refusalId = useId();
  const words = change === "delete" ? DELETE_ASSET_WORDS : RELOCATE_ASSET_WORDS[change];
  const [typedText, setTypedText] = useState(change === "rename" ? assetFileName(asset.path) : change === "move" ? assetFolderOf(asset.path) : "");
  const [changeRefusal, setChangeRefusal] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const fieldRefusal = change === "rename" ? assetFileNameRefusal(typedText) : change === "move" ? assetFolderRefusal(typedText) : null;
  const pathItLandsAt = change === "rename" ? assetPathRenamed(asset.path, typedText) : assetPathMoved(asset.path, typedText);
  const formElement = useRef<HTMLElement>(null);
  const focusTheFormsFirstControl = () => {
    const field = formElement.current?.querySelector("input") ?? null;
    if (field !== null) field.select();
    else formElement.current?.querySelector<HTMLButtonElement>('[data-library-asset-change-action="cancel"]')?.focus();
  };
  useEffect(focusTheFormsFirstControl, []);
  const changeIt = () => {
    if (fieldRefusal !== null || isChanging) return;
    if (change !== "delete" && pathItLandsAt === asset.path) {
      onClosed();
      return;
    }
    setIsChanging(true);
    setChangeRefusal(null);
    const asking: Promise<ViewAskDone> =
      change === "delete" ? connection.deleteAssetFromTheProject(projectFolder, asset.asset) : connection.relocateAssetInTheProject(projectFolder, asset.asset, pathItLandsAt);
    void asking.then((done) => {
      setIsChanging(false);
      if (done.kind === "done") {
        onClosed();
        return;
      }
      setChangeRefusal(done.because);
      focusTheFormsFirstControl();
    });
  };
  const closeUnlessChanging = () => {
    if (!isChanging) onClosed();
  };
  const answerTheKeyInTheForm = (keyboardEvent: KeyboardEvent<HTMLElement>) => {
    if (keyboardEvent.nativeEvent.isComposing) return;
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      closeUnlessChanging();
      return;
    }
    if (keyboardEvent.key !== "Enter" || !(keyboardEvent.target instanceof HTMLInputElement)) return;
    keyboardEvent.preventDefault();
    changeIt();
  };
  const refusalUnderTheField =
    changeRefusal !== null ? (
      <RefusalLine layout="under_field" lead={words.refusalLead} words={changeRefusal} data-library-asset-change-refusal="" />
    ) : fieldRefusal !== null && typedText.trim() !== "" ? (
      <RefusalLine layout="under_field" tone="warning" words={fieldRefusal} data-library-asset-change-field-refusal="" />
    ) : null;
  return (
    <section ref={formElement} aria-label={words.title} className="flex flex-col gap-2 border-b px-4 py-3" onKeyDown={answerTheKeyInTheForm} data-library-asset-change-form={change}>
      <h3 className="text-sm font-medium text-fg">{words.title}</h3>
      {change === "delete" ? (
        <>
          <p className="text-xs text-fg-3">{DELETE_ASSET_WORDS.descriptionOf(assetFileName(asset.path))}</p>
          {changeRefusal !== null && (
            <RefusalLine lead={words.refusalLead} words={changeRefusal} data-library-asset-change-refusal="" />
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-fg-3">{RELOCATE_ASSET_WORDS[change].description}</p>
          <div>
            <label htmlFor={fieldId} className="block pb-1 text-2xs text-fg-3">
              {RELOCATE_ASSET_WORDS[change].fieldLabel}
            </label>
            <TextField
              id={fieldId}
              label={RELOCATE_ASSET_WORDS[change].fieldLabel}
              text={typedText}
              onTextChanged={(text) => {
                setTypedText(text);
                setChangeRefusal(null);
              }}
              isMachineWord
              isRequired={change === "rename"}
              isRefused={changeRefusal !== null}
              describedBy={refusalUnderTheField === null ? undefined : refusalId}
              className="w-full"
              data-library-asset-change-field=""
            />
            {refusalUnderTheField !== null && (
              <div id={refusalId}>{refusalUnderTheField}</div>
            )}
            <span className="block truncate pt-1 font-mono text-2xs text-fg-3" title={pathItLandsAt} data-library-asset-change-lands-at="">
              {pathItLandsAt}
            </span>
          </div>
        </>
      )}
      <div className="flex items-center justify-end gap-2">
        <ActionButton appearance="quiet" size="small" isDisabled={isChanging} onPressed={closeUnlessChanging} data-library-asset-change-action="cancel">
          Cancel
        </ActionButton>
        {isChanging && <PendingActionWords words={words.pendingWords} />}
        <ActionButton
          appearance={change === "delete" ? "destructive" : "primary"}
          size="small"
          disabledReason={isChanging ? words.pendingWords : fieldRefusal}
          onPressed={changeIt}
          data-library-asset-change-action={change}
        >
          {words.actionWords}
        </ActionButton>
      </div>
    </section>
  );
}
