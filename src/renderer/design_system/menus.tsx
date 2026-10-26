import { cn } from "cn";
import { ChevronDown, Ellipsis, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ControlDataAttributeName, ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";
import { ICON_BUTTON_CLASS_NAMES } from "./icon_button";

/** How wide an open menu is: as wide as its words, or a fixed width for choices that read better aligned. */
export type MenuWidth = "fit" | "wide";

const MENU_WIDTH_CLASS_NAMES: Record<MenuWidth, string> = { fit: "w-auto min-w-56", wide: "w-[288px] max-h-96" };

/** The ⋯ button that opens a row's or a page's other actions. */
export function MoreActionsMenu({ label, children, ...controlDataAttributes }: { label: string; children: ReactNode } & ControlDataAttributes) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className={ICON_BUTTON_CLASS_NAMES} />} aria-label={label} {...controlDataAttributes}>
        <Ellipsis className="size-4" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={MENU_WIDTH_CLASS_NAMES.fit}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
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
  /** The field's accessible name, saying what is chosen now, as "Steps shown: All steps". */
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

/** One choice of a menu; a destructive one reads red. */
export function MenuItem({
  icon: ItemIcon,
  isDestructive = false,
  keepsTheMenuOpen = false,
  isDisabled = false,
  onChosen,
  children,
  ...controlDataAttributes
}: {
  icon?: LucideIcon;
  isDestructive?: boolean;
  /** For a choice whose effect is shown in the menu itself. */
  keepsTheMenuOpen?: boolean;
  isDisabled?: boolean;
  onChosen: () => void;
  children: ReactNode;
} & ControlDataAttributes) {
  return (
    <DropdownMenuItem
      variant={isDestructive ? "destructive" : "default"}
      closeOnClick={!keepsTheMenuOpen}
      disabled={isDisabled}
      onClick={onChosen}
      className="px-2 data-[variant=destructive]:text-danger-text data-[variant=destructive]:focus:text-danger-text"
      {...controlDataAttributes}
    >
      {ItemIcon !== undefined && <ItemIcon className={cn("size-4", isDestructive ? "text-danger" : "text-fg-3")} strokeWidth={1.75} aria-hidden />}
      {children}
    </DropdownMenuItem>
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
