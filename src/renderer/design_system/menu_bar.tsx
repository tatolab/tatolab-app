import { Menubar } from "@base-ui/react/menubar";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** One entry of a menu bar's menu: a command, one that cannot run now, one of a set of choices (ticked when chosen), a submenu, or a hairline. */
export type StudioMenuEntry =
  | { kind: "command"; label: string; shortcutHint?: string; onChosen: () => void }
  | {
      kind: "unavailable_command";
      label: string;
      shortcutHint?: string;
      /** Why it cannot run now, which the dim entry says in its tooltip and to a screen reader. */
      unavailableBecause: string;
    }
  | { kind: "choice"; label: string; shortcutHint?: string; isChosen: boolean; onChosen: () => void }
  | { kind: "submenu"; label: string; entries: readonly StudioMenuEntry[] }
  | { kind: "separator" };

/** A menu of the bar: its name on the bar, and its entries. */
export interface StudioMenu {
  label: string;
  entries: readonly StudioMenuEntry[];
}

const MENU_ENTRY_CLASS_NAMES = "h-[26px] gap-2 rounded-sm px-2 text-xs";

function StudioMenuEntries({ entries }: { entries: readonly StudioMenuEntry[] }) {
  return entries.map((entry, entryIndex) => {
    switch (entry.kind) {
      case "separator":
        return <DropdownMenuSeparator key={`separator-${entryIndex}`} />;
      case "submenu":
        return (
          <DropdownMenuSub key={entry.label}>
            <DropdownMenuSubTrigger className={cn(MENU_ENTRY_CLASS_NAMES, "pl-7")}>{entry.label}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-52">
              <StudioMenuEntries entries={entry.entries} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      case "choice":
        return (
          <DropdownMenuCheckboxItem
            key={entry.label}
            checked={entry.isChosen}
            onCheckedChange={entry.onChosen}
            closeOnClick
            className={cn(MENU_ENTRY_CLASS_NAMES, "pl-7")}
          >
            {entry.label}
            {entry.shortcutHint !== undefined && <DropdownMenuShortcut>{entry.shortcutHint}</DropdownMenuShortcut>}
          </DropdownMenuCheckboxItem>
        );
      case "command":
        return (
          <DropdownMenuItem key={entry.label} onClick={entry.onChosen} className={cn(MENU_ENTRY_CLASS_NAMES, "pl-7")}>
            {entry.label}
            {entry.shortcutHint !== undefined && <DropdownMenuShortcut>{entry.shortcutHint}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        );
      case "unavailable_command":
        return (
          <DropdownMenuItem
            key={entry.label}
            disabled
            aria-description={entry.unavailableBecause}
            title={entry.unavailableBecause}
            className={cn(MENU_ENTRY_CLASS_NAMES, "pl-7")}
          >
            {entry.label}
            {entry.shortcutHint !== undefined && <DropdownMenuShortcut>{entry.shortcutHint}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        );
    }
  });
}

/** The studio's menus along the top of the window, opened by a click or from the keyboard, the arrows moving between them. */
export function StudioMenuBar({ label, menus }: { label: string; menus: readonly StudioMenu[] }) {
  return (
    <Menubar aria-label={label} className="flex items-center gap-0.5">
      {menus.map((menu) => (
        <DropdownMenu key={menu.label}>
            <DropdownMenuTrigger
              className={cn(
                "h-[26px] rounded-sm px-2 text-studio text-fg-2 outline-none hover:bg-hover data-popup-open:bg-studio-control-open data-popup-open:text-fg",
                FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
              )}
              data-studio-menu={menu.label}
            >
              {menu.label}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[230px]">
              <StudioMenuEntries entries={menu.entries} />
            </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </Menubar>
  );
}
