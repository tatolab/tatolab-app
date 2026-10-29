import { Pencil } from "lucide-react";
import type { ReactElement } from "react";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { RightClickMenu, RightClickMenuItem } from "../design_system/menus";

/** A stream's row, as the sidebar and the Streams list draw it, with the menu a right-click on it opens. */
export function StreamRowRightClickMenu({ stream, onRenameAsked, children }: { stream: ListedStream; onRenameAsked: () => void; children: ReactElement }) {
  return (
    <RightClickMenu
      label={`Actions for ${stream.display_name}`}
      choices={
        <RightClickMenuItem icon={Pencil} onChosen={onRenameAsked} data-stream-action="rename_stream">
          Rename…
        </RightClickMenuItem>
      }
    >
      {children}
    </RightClickMenu>
  );
}
