import { cn } from "cn";
import { ChevronDown, Ellipsis, type LucideIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { ControlDataAttributeName, ControlDataAttributes } from "./support/control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./support/full_strength_focus_ring";
import { ICON_BUTTON_CLASS_NAMES, STOCK_ICON_BUTTON_SIZE, type IconButtonSize } from "./icon_button";

/** How wide an open menu is: as wide as its words, or a fixed width for choices that read better aligned. */
export type MenuWidth = "fit" | "wide";

const MENU_WIDTH_CLASS_NAMES: Record<MenuWidth, string> = { fit: "w-auto min-w-56", wide: "w-[288px] max-h-96" };

/** A menu choice's padding and its icon's look, the same in a dropdown menu and a right-click menu. */
const MENU_ITEM_CLASS_NAMES = "px-2";
const MENU_ITEM_ICON_CLASS_NAMES = "size-4 text-fg-3";

/** An icon button that opens a menu of its choices: regular in rows and bars, compact beside a heading. */
export function IconButtonMenu({
  icon: TriggerIcon,
  label,
  size = "regular",
  menuAlignment = "end",
  isOverAPicture = false,
  children,
  ...controlDataAttributes
}: {
  icon: LucideIcon;
  label: string;
  size?: IconButtonSize;
  /** Which edge of the button the open menu lines up with. */
  menuAlignment?: "start" | "end";
  /** Drawn over a picture, as a project's cover: on a ground of its own with an outline, so it reads over any picture. */
  isOverAPicture?: boolean;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size={STOCK_ICON_BUTTON_SIZE[size]} className={cn(ICON_BUTTON_CLASS_NAMES, isOverAPicture && ICON_BUTTON_OVER_A_PICTURE_CLASS_NAMES)} />}
        aria-label={label}
        {...controlDataAttributes}
      >
        <TriggerIcon className="size-4" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={menuAlignment} className={MENU_WIDTH_CLASS_NAMES.fit}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** An icon button's look over a picture: a ground of the window's colour and an outline, so its icon reads over any picture. */
const ICON_BUTTON_OVER_A_PICTURE_CLASS_NAMES = "border border-line-strong bg-window/85 text-fg backdrop-blur-sm hover:bg-window dark:hover:bg-window data-popup-open:bg-window aria-expanded:bg-window";

/** The ⋯ button that opens a row's, a card's or a page's other actions. */
export function MoreActionsMenu({
  label,
  isOverAPicture = false,
  children,
  ...controlDataAttributes
}: { label: string; isOverAPicture?: boolean; children: ReactNode } & ControlDataAttributes) {
  return (
    <IconButtonMenu icon={Ellipsis} label={label} isOverAPicture={isOverAPicture} {...controlDataAttributes}>
      {children}
    </IconButtonMenu>
  );
}

/**
 * A field that opens a menu of choices: what is chosen now, before a chevron. Outlined; a filter reads stronger while
 * it narrows what is shown.
 */
export function FieldMenu({
  label,
  leading,
  words,
  isNarrowing = false,
  fillsItsPlace = false,
  menuWidth = "fit",
  children,
  ...controlDataAttributes
}: {
  /** The field's accessible name, saying what is chosen now, as "Function: camera_stream". */
  label: string;
  /** An icon or a quiet word before the chosen words. */
  leading?: ReactNode;
  words: ReactNode;
  isNarrowing?: boolean;
  fillsItsPlace?: boolean;
  menuWidth?: MenuWidth;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "min-w-0 shrink-0 gap-1.5 rounded-md border-line bg-window pr-1.5 pl-2 text-sm font-normal text-fg-2 hover:border-line-strong hover:bg-hover hover:text-fg aria-expanded:bg-hover dark:border-line dark:bg-window dark:hover:bg-hover",
              isNarrowing && "border-line-strong text-fg dark:border-line-strong",
              fillsItsPlace ? "w-full" : "max-w-96",
              FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
            )}
          />
        }
        aria-label={label}
        {...controlDataAttributes}
      >
        {leading}
        <span className="flex min-w-0 items-center gap-1.5 truncate">{words}</span>
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={MENU_WIDTH_CLASS_NAMES[menuWidth]}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What stands before a menu item's words: an icon, or something in its place such as a served logo; never both. */
type MenuItemPicture = { icon?: LucideIcon; leading?: never } | { icon?: never; leading?: ReactNode };

/** One choice of a menu; a destructive one reads red. */
export function MenuItem({
  icon: ItemIcon,
  leading,
  isDestructive = false,
  keepsTheMenuOpen = false,
  isDisabled = false,
  shortcutHint,
  onChosen,
  children,
  ...controlDataAttributes
}: {
  isDestructive?: boolean;
  /** The key cap of the shortcut that does the same, shown at the item's end, as ⌘N. */
  shortcutHint?: string;
  /** For a choice whose effect is shown in the menu itself. */
  keepsTheMenuOpen?: boolean;
  isDisabled?: boolean;
  onChosen: () => void;
  children: ReactNode;
} & MenuItemPicture &
  ControlDataAttributes) {
  return (
    <DropdownMenuItem
      variant={isDestructive ? "destructive" : "default"}
      closeOnClick={!keepsTheMenuOpen}
      disabled={isDisabled}
      onClick={onChosen}
      className={cn(MENU_ITEM_CLASS_NAMES, "data-[variant=destructive]:text-danger-text data-[variant=destructive]:focus:text-danger-text")}
      {...controlDataAttributes}
    >
      {ItemIcon !== undefined && <ItemIcon className={cn(MENU_ITEM_ICON_CLASS_NAMES, isDestructive && "text-danger")} strokeWidth={1.75} aria-hidden />}
      {leading}
      {children}
      {shortcutHint !== undefined && <DropdownMenuShortcut>{shortcutHint}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
}

/** A menu a right-click on `children` opens at the pointer; `children` is the row itself, so a click in the menu never reaches the row. */
export function RightClickMenu({ label, choices, children }: { label: string; choices: ReactNode; children: ReactElement }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent aria-label={label} className={MENU_WIDTH_CLASS_NAMES.fit}>
        {choices}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** One choice of a right-click menu, drawn as a dropdown menu's choice is. */
export function RightClickMenuItem({
  icon: ItemIcon,
  onChosen,
  children,
  ...controlDataAttributes
}: { icon?: LucideIcon; onChosen: () => void; children: ReactNode } & ControlDataAttributes) {
  return (
    <ContextMenuItem onClick={onChosen} className={MENU_ITEM_CLASS_NAMES} {...controlDataAttributes}>
      {ItemIcon !== undefined && <ItemIcon className={MENU_ITEM_ICON_CLASS_NAMES} strokeWidth={1.75} aria-hidden />}
      {children}
    </ContextMenuItem>
  );
}

/** A choice of a menu that is on or off, ticked while on; choosing it leaves the menu open. */
export function MenuCheckboxItem({
  isChecked,
  onCheckedChange,
  children,
  ...controlDataAttributes
}: { isChecked: boolean; onCheckedChange: (isChecked: boolean) => void; children: ReactNode } & ControlDataAttributes) {
  return (
    <DropdownMenuCheckboxItem checked={isChecked} onCheckedChange={onCheckedChange} className="pl-2" {...controlDataAttributes}>
      {children}
    </DropdownMenuCheckboxItem>
  );
}

/** One of a menu's single choices: what choosing it chooses, and its words. */
export interface MenuSingleChoice<Choice extends string> {
  choice: Choice;
  label: ReactNode;
}

/** A menu's choices of which exactly one is chosen, the chosen one marked. */
export function MenuSingleChoiceGroup<Choice extends string>({
  choices,
  chosen,
  onChosen,
  dataAttributeOfEachChoice,
}: {
  choices: readonly MenuSingleChoice<Choice>[];
  chosen: Choice;
  onChosen: (choice: Choice) => void;
  /** Set on each choice to its value, as `data-streams-list-state-choice="failed"`. */
  dataAttributeOfEachChoice?: ControlDataAttributeName;
}) {
  return (
    <DropdownMenuRadioGroup
      value={chosen}
      onValueChange={(value: string) => {
        const chosenChoice = choices.find((menuChoice) => menuChoice.choice === value);
        if (chosenChoice !== undefined) onChosen(chosenChoice.choice);
      }}
    >
      {choices.map(({ choice, label }) => (
        <DropdownMenuRadioItem key={choice} value={choice} className="pl-2" {...(dataAttributeOfEachChoice === undefined ? {} : { [dataAttributeOfEachChoice]: choice })}>
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/** Choices of a menu that belong together, under their label. */
export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="px-2">{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  );
}

/** A hairline between groups of a menu's choices. */
export function MenuSeparator() {
  return <DropdownMenuSeparator />;
}

/** A line of a menu that is read, not chosen: what a group holds when it holds nothing yet. */
export function MenuNote({ children }: { children: ReactNode }) {
  return <p className="px-2 py-1 text-xs text-fg-3">{children}</p>;
}
