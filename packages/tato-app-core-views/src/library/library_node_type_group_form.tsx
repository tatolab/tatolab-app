// The Library's Move to group of a node type, opened from its row's right-click menu: a form atop the tree that
// asks the runtime's `set_node_type_group` through the view's connection and closes once the project files the node
// type under the group typed. It scrolls with the tree, not over it, since a view's dialog is held to the view's area
// and a short area would otherwise hide the form's buttons.

import { useId, useState } from "react";
import type { TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { ActionButton } from "@tatolab/tato-app-view-sdk/design_system/action_button";
import { PendingActionWords } from "@tatolab/tato-app-view-sdk/design_system/pending_action_words";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { TextField } from "@tatolab/tato-app-view-sdk/design_system/text_field";
import { nodeTypeCategoryPath } from "../shared/node_type_category_path";
import type { DeclarationRowMeaning } from "../shared/node_type_listing_tree";
import { useLibraryChangeFormAsk } from "./library_change_form_ask";

/** A node type as the Library's tree lists it. */
export type NodeTypeTheLibraryLists = Extract<DeclarationRowMeaning, { kind: "node_type_declaration" }>["node_type"];

/** The group `nodeType` is filed under now, as the form's field starts out: its names split by `/`, as `Effects/Stylize`. */
export function groupTypedForTheNodeType(nodeType: NodeTypeTheLibraryLists): string {
  return nodeTypeCategoryPath(nodeType.category ?? null).join("/");
}

/** The form moving `nodeType` into the group typed in the project in `projectFolder`; it closes once the runtime has filed it, on Escape or Cancel while nothing is asked, or at once when the group typed is the one it is filed under. */
export function LibraryNodeTypeGroupForm({
  nodeType,
  projectFolder,
  connection,
  onClosed,
}: {
  nodeType: NodeTypeTheLibraryLists;
  projectFolder: string;
  connection: Pick<TatoAppViewConnection, "setNodeTypeGroupInTheProject">;
  onClosed: () => void;
}) {
  const fieldId = useId();
  const refusalId = useId();
  const groupFiledUnderNow = groupTypedForTheNodeType(nodeType);
  const [typedGroup, setTypedGroup] = useState(groupFiledUnderNow);
  const { formElement, isAsking: isMoving, refusal: moveRefusal, clearTheRefusal, askIt, closeUnlessAsking: closeUnlessMoving, answerTheKeyInTheForm } = useLibraryChangeFormAsk(onClosed, '[data-library-node-type-group-action="cancel"]');
  const groupAsked = typedGroup.trim();
  const whyItCannotMove = groupAsked === "" ? "Type the group to move it into." : null;
  const moveIt = () => {
    if (whyItCannotMove !== null || isMoving) return;
    if (groupAsked === groupFiledUnderNow) {
      onClosed();
      return;
    }
    askIt(() => connection.setNodeTypeGroupInTheProject(projectFolder, nodeType.node_type, groupAsked));
  };
  return (
    <section ref={formElement} aria-label="Move to group" className="flex flex-col gap-2 border-b px-4 py-3" onKeyDown={(keyboardEvent) => answerTheKeyInTheForm(keyboardEvent, moveIt)} data-library-node-type-group-form={nodeType.node_type}>
      <h3 className="text-sm font-medium text-fg">Move to group</h3>
      <p className="text-xs text-fg-3">Where the Library and Add node list it in this project. Put a group inside another with “/”, as Effects/Stylize.</p>
      <div>
        <label htmlFor={fieldId} className="block pb-1 text-2xs text-fg-3">
          Group
        </label>
        <TextField
          id={fieldId}
          label="Group"
          text={typedGroup}
          onTextChanged={(text) => {
            setTypedGroup(text);
            clearTheRefusal();
          }}
          isRequired
          isRefused={moveRefusal !== null}
          describedBy={moveRefusal === null ? undefined : refusalId}
          className="w-full"
          data-library-node-type-group-field=""
        />
        {moveRefusal !== null && (
          <div id={refusalId}>
            <RefusalLine layout="under_field" lead="The node type wasn't moved:" words={moveRefusal} data-library-node-type-group-refusal="" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <ActionButton appearance="quiet" size="small" isDisabled={isMoving} onPressed={closeUnlessMoving} data-library-node-type-group-action="cancel">
          Cancel
        </ActionButton>
        {isMoving && <PendingActionWords words="Moving…" />}
        <ActionButton appearance="primary" size="small" disabledReason={isMoving ? "Moving…" : whyItCannotMove} onPressed={moveIt} data-library-node-type-group-action="move">
          Move
        </ActionButton>
      </div>
    </section>
  );
}
