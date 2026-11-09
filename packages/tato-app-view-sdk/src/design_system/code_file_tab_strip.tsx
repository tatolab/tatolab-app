import { cn } from "cn";
import { Lock, Plus, ScrollText, X } from "lucide-react";
import { Fragment } from "react";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { IconButtonMenu, MenuGroup, MenuItem, MenuNote, MenuSeparator } from "./menus";
import { ToggleIconButton } from "./toggle_icon_button";

/** One open file's tab in a code area's header. */
export interface CodeFileTab {
  /** The file's absolute path. */
  file: string;
  /** Its name, with the folders that tell it apart from another open file of the same name. */
  name: string;
  has_edits_not_saved: boolean;
  is_read_only: boolean;
}

/** The files of one project the file menu offers. */
export interface OpenableCodeFileGroup {
  project_name: string;
  files: readonly { file: string; name: string }[];
  /** Why the project's files could not be listed, shown in place of them. */
  not_listed_because: string | null;
}

/** A code area's header tools: its open files' tabs, the menu that opens another, and the switch that shows the project's log. */
export function CodeFileTabStrip({
  tabs,
  shownFile,
  openableFileGroups,
  areLogsShown,
  onTabChosen,
  onTabClosed,
  onFileChosen,
  onLogsToggled,
}: {
  tabs: readonly CodeFileTab[];
  shownFile: string | null;
  openableFileGroups: readonly OpenableCodeFileGroup[];
  areLogsShown: boolean;
  onTabChosen: (file: string) => void;
  onTabClosed: (file: string) => void;
  onFileChosen: (file: string) => void;
  onLogsToggled: (areShown: boolean) => void;
}) {
  return (
    <>
      <div role="tablist" aria-label="Open files" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isShown = tab.file === shownFile;
          return (
            <div key={tab.file} className={cn("group flex h-[22px] shrink-0 items-center rounded-sm pr-0.5", isShown ? "bg-studio-control text-fg" : "text-fg-3 hover:bg-hover hover:text-fg-2")}>
              <button
                type="button"
                role="tab"
                aria-selected={isShown}
                title={tab.file}
                onClick={() => onTabChosen(tab.file)}
                className={cn("flex h-full items-center gap-1 rounded-sm pl-2 font-mono text-2xs outline-none", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
                data-code-file-tab={tab.file}
                data-code-file-tab-has-edits={tab.has_edits_not_saved}
              >
                {tab.is_read_only && <Lock className="size-3 text-studio-read-only" strokeWidth={1.75} aria-label="Read only" />}
                {tab.name}
                {tab.has_edits_not_saved && (
                  <span className="text-fg-2" title="Edits not saved">
                    *
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={tab.has_edits_not_saved ? `Close ${tab.name}, which has edits not saved` : `Close ${tab.name}`}
                onClick={() => onTabClosed(tab.file)}
                className={cn("ml-0.5 flex size-4 items-center justify-center rounded-sm text-fg-3 outline-none hover:bg-hover hover:text-fg", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
                data-code-file-tab-close={tab.file}
              >
                <X className={cn("size-3", !isShown && "opacity-0 group-hover:opacity-100")} strokeWidth={2} aria-hidden />
              </button>
            </div>
          );
        })}
        <IconButtonMenu icon={Plus} label="Open a file" size="compact" menuAlignment="start" data-code-file-menu="open">
          {openableFileGroups.length === 0 && <MenuNote>No project is open.</MenuNote>}
          {openableFileGroups.map((group, groupIndex) => (
            <Fragment key={group.project_name}>
              {groupIndex > 0 && <MenuSeparator />}
              <MenuGroup label={group.project_name}>
                {group.not_listed_because !== null ? (
                  <MenuNote>{group.not_listed_because}</MenuNote>
                ) : group.files.length === 0 ? (
                  <MenuNote>No Python files.</MenuNote>
                ) : (
                  group.files.map(({ file, name }) => (
                    <MenuItem key={file} onChosen={() => onFileChosen(file)} data-code-file-choice={file}>
                      <span className="font-mono text-xs">{name}</span>
                    </MenuItem>
                  ))
                )}
              </MenuGroup>
            </Fragment>
          ))}
        </IconButtonMenu>
      </div>
      <ToggleIconButton
        icon={ScrollText}
        label="Project log"
        tooltipWhileOn="Hide the project's log"
        tooltipWhileOff="Show the project's log under the code"
        isOn={areLogsShown}
        onToggled={onLogsToggled}
        size="compact"
        data-code-logs-toggle={areLogsShown ? "shown" : "hidden"}
      />
    </>
  );
}
