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
} from "./ui/dropdown-menu";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "./ui/button";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { ICON_BUTTON_CLASS_NAMES, STOCK_ICON_BUTTON_SIZE } from "./icon_button";
import { WithControlTooltip } from "./control_tooltip";

/** One rectangle of a menu entry's picture, in percent of the picture's width and height; the emphasised one is drawn in the brand colour. */
export interface StudioMenuEntryPictureArea {
  left_percent: number;
  top_percent: number;
  width_percent: number;
  height_percent: number;
  is_emphasised: boolean;
}

/** One entry of a menu bar's menu: a command (with a small picture of rectangles before its label, where it has one), one that cannot run now, one of a set of choices (ticked when chosen), a submenu, or a hairline. */
export type StudioMenuEntry =
  | { kind: "command"; label: string; shortcutHint?: string; picture?: readonly StudioMenuEntryPictureArea[]; onChosen: () => void }
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

/** A choice's tick sits in the entries' leading gutter, clear of its shortcut at the end. */
const MENU_CHOICE_TICK_IN_THE_GUTTER_CLASS_NAMES = "[&>[data-slot=dropdown-menu-checkbox-item-indicator]]:right-auto [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:left-2";

/** A command's picture: its rectangles drawn small, filling the gutter the other entries leave before their labels. */
function StudioMenuEntryPicture({ areas }: { areas: readonly StudioMenuEntryPictureArea[] }) {
  return (
    <span aria-hidden="true" className="relative h-3 w-4 shrink-0" data-menu-entry-picture="">
      {areas.map((area, areaIndex) => (
        <span
          key={areaIndex}
          className="absolute p-px"
          style={{ left: `${area.left_percent}%`, top: `${area.top_percent}%`, width: `${area.width_percent}%`, height: `${area.height_percent}%` }}
        >
          <span className={cn("block size-full rounded-[2px] border", area.is_emphasised ? "border-brand-text bg-brand-soft" : "border-fg-3")} />
        </span>
      ))}
    </span>
  );
}

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
            className={cn(MENU_ENTRY_CLASS_NAMES, "pl-7", MENU_CHOICE_TICK_IN_THE_GUTTER_CLASS_NAMES)}
          >
            {entry.label}
            {entry.shortcutHint !== undefined && <DropdownMenuShortcut>{entry.shortcutHint}</DropdownMenuShortcut>}
          </DropdownMenuCheckboxItem>
        );
      case "command":
        return (
          <DropdownMenuItem key={entry.label} onClick={entry.onChosen} className={cn(MENU_ENTRY_CLASS_NAMES, entry.picture === undefined ? "pl-7" : "pl-1")}>
            {entry.picture !== undefined && <StudioMenuEntryPicture areas={entry.picture} />}
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
            <DropdownMenuContent align="start" className="w-max min-w-[230px]">
              <StudioMenuEntries entries={menu.entries} />
            </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </Menubar>
  );
}

/** An icon button that opens the entries of one of the menu bar's menus, as the title row's layout button opens Window › Layout. */
export function StudioMenuButton({
  icon: TriggerIcon,
  label,
  entries,
  ...controlDataAttributes
}: { icon: LucideIcon; label: string; entries: readonly StudioMenuEntry[] } & ControlDataAttributes) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size={STOCK_ICON_BUTTON_SIZE.regular} className={ICON_BUTTON_CLASS_NAMES} />} aria-label={label} title={label} {...controlDataAttributes}>
        <TriggerIcon className="size-4" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max min-w-[230px]">
        <StudioMenuEntries entries={entries} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The brand's ground a split menu button stands on while what it controls is live, hover and an open menu included. */
const SPLIT_MENU_BUTTON_LIVE_CLASS_NAMES =
  "bg-brand text-primary-foreground hover:bg-brand hover:text-primary-foreground dark:hover:bg-brand aria-expanded:bg-brand aria-expanded:text-primary-foreground data-popup-open:bg-brand data-popup-open:text-primary-foreground hover:data-popup-open:bg-brand hover:data-popup-open:text-primary-foreground";

/** A split menu button's half that cannot act now: dim, and still on the brand's ground while what it controls is live. */
const SPLIT_MENU_BUTTON_UNAVAILABLE_CLASS_NAMES = "text-fg-4 hover:bg-transparent hover:text-fg-4 hover:shadow-none dark:hover:bg-transparent";

/**
 * An icon button that runs one command, joined to a chevron that opens the entries of one of the menu bar's menus, as the title row's player control leads
 * with the playback's next step beside Run's entries. While what it controls is live, both halves stand on the brand's ground and the icon is drawn filled.
 */
export function StudioSplitMenuButton({
  icon: ButtonIcon,
  label,
  unavailableBecause,
  isLive,
  onPressed,
  menuLabel,
  entries,
  menuDataAttributes = {},
  ...controlDataAttributes
}: {
  icon: LucideIcon;
  /** The button's accessible name and its tooltip, as "Pause the project". */
  label: string;
  /** Why the button cannot act now, which its tooltip says instead; `null` while it can. */
  unavailableBecause: string | null;
  isLive: boolean;
  onPressed: () => void;
  /** The chevron's accessible name, as "Playback choices". */
  menuLabel: string;
  entries: readonly StudioMenuEntry[];
  /** The `data-*` attributes of the chevron, as the button's own go on the button. */
  menuDataAttributes?: ControlDataAttributes;
} & ControlDataAttributes) {
  const isUnavailable = unavailableBecause !== null;
  return (
    <span className="flex shrink-0" data-studio-split-menu-button="" data-live={isLive || undefined}>
      <WithControlTooltip
        tooltip={unavailableBecause ?? label}
        isWide
        control={
          <Button
            variant="ghost"
            size={STOCK_ICON_BUTTON_SIZE.regular}
            aria-label={isUnavailable ? `${label}: ${unavailableBecause}` : label}
            aria-disabled={isUnavailable || undefined}
            onClick={() => {
              if (!isUnavailable) onPressed();
            }}
            className={cn(ICON_BUTTON_CLASS_NAMES, "rounded-r-none", isLive && SPLIT_MENU_BUTTON_LIVE_CLASS_NAMES, isUnavailable && !isLive && SPLIT_MENU_BUTTON_UNAVAILABLE_CLASS_NAMES)}
            {...controlDataAttributes}
          >
            <ButtonIcon className={isLive ? "size-3.5 fill-current" : "size-4"} strokeWidth={1.75} aria-hidden />
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className={cn(ICON_BUTTON_CLASS_NAMES, "h-7 w-4 min-w-4 rounded-l-none px-0", isLive && cn(SPLIT_MENU_BUTTON_LIVE_CLASS_NAMES, "border-l border-l-primary-foreground/25"))}
            />
          }
          aria-label={menuLabel}
          title={menuLabel}
          {...menuDataAttributes}
        >
          <ChevronDown className="size-3" strokeWidth={2} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max min-w-[230px]">
          <StudioMenuEntries entries={entries} />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
