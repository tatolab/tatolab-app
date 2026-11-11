import { cn } from "cn";
import { Box, Check, ChevronDown, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";
import { RefusalLine } from "./refusal_line";
import { IconButton } from "./icon_button";
import { FieldMenu, MenuItem, MenuNote } from "./menus";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";

/** A titled group of a details panel that folds away, as Blender's and Unreal's property panels do; open at first. */
export function PropertySection({
  title,
  aside,
  children,
  ...controlDataAttributes
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
} & ControlDataAttributes) {
  const [isOpen, setIsOpen] = useState(true);
  const contentsId = useId();
  const ChevronIcon = isOpen ? ChevronDown : ChevronRight;
  return (
    <section className="flex min-w-0 flex-col border-b last:border-b-0" {...controlDataAttributes}>
      <h3 className="m-0">
        <button
          type="button"
          className="flex h-7 w-full items-center gap-1.5 px-2 text-left text-xs font-medium text-fg-2 hover:text-fg"
          aria-expanded={isOpen}
          aria-controls={contentsId}
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronIcon className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
          <span className="truncate">{title}</span>
          {aside !== undefined && <span className="ml-auto shrink-0 text-2xs font-normal text-fg-3">{aside}</span>}
        </button>
      </h3>
      {isOpen && (
        <div id={contentsId} className="flex min-w-0 flex-col gap-1 px-2 pb-2.5">
          {children}
        </div>
      )}
    </section>
  );
}

/** A property row's columns: its name, its field, and room for its reset. */
const PROPERTY_ROW_GRID_CLASS_NAMES = "grid-cols-[minmax(0,2fr)_minmax(0,3fr)_1.5rem]";

/**
 * One property: its name in words in a right-aligned column, what it means while the pointer rests on the name, its
 * value's field, a reset beside it while the value is the node's own, and the runtime's refusal of an edit under it.
 */
export function PropertyRow({
  label,
  meaning,
  reset,
  refusal = null,
  children,
  ...controlDataAttributes
}: {
  label: string;
  meaning?: string;
  /** Puts the type's default back; absent while the value is already its type's. */
  reset?: { label: string; onReset: () => void };
  /** Why the runtime refused the last edit of this property, in its own words. */
  refusal?: string | null;
  children: (fieldId: string) => ReactNode;
} & ControlDataAttributes) {
  const fieldId = useId();
  return (
    <div className="flex min-w-0 flex-col" {...controlDataAttributes}>
      <div className={cn("grid min-w-0 items-center gap-2", PROPERTY_ROW_GRID_CLASS_NAMES)}>
        <WithControlTooltip
          tooltip={meaning}
          isWide
          control={
            <label htmlFor={fieldId} className="truncate text-right text-xs text-fg-2">
              {label}
            </label>
          }
        />
        <div className="min-w-0">{children(fieldId)}</div>
        {reset === undefined ? <span /> : <IconButton icon={RotateCcw} label={reset.label} size="compact" onPressed={reset.onReset} data-property-reset />}
      </div>
      {refusal !== null && (
        <div className={cn("grid gap-2", PROPERTY_ROW_GRID_CLASS_NAMES)} data-property-refusal>
          <div className="col-span-2 col-start-2 min-w-0">
            <RefusalLine words={refusal} layout="under_field" />
          </div>
        </div>
      )}
    </div>
  );
}

/** One entry of a property that is a list of records: its label on a line of its own with a remove beside it, and its own property rows indented under it. */
export function PropertyListEntry({
  label,
  removal,
  children,
  ...controlDataAttributes
}: {
  label: string;
  /** Takes the entry out of the list; absent while the list can't be edited. */
  removal?: { label: string; onRemoved: () => void };
  children: ReactNode;
} & ControlDataAttributes) {
  const entryLabelId = useId();
  return (
    <div role="group" aria-labelledby={entryLabelId} className="flex min-w-0 flex-col gap-1" {...controlDataAttributes}>
      <div className={cn("grid min-w-0 items-center gap-2", PROPERTY_ROW_GRID_CLASS_NAMES)}>
        <span id={entryLabelId} className="truncate text-right text-xs font-medium text-fg-2">
          {label}
        </span>
        <span />
        {removal === undefined ? <span /> : <IconButton icon={Minus} label={removal.label} size="compact" onPressed={removal.onRemoved} data-property-list-entry-remove />}
      </div>
      <div className="ml-3 flex min-w-0 flex-col gap-1 border-l pl-1">{children}</div>
    </div>
  );
}

/** How many entries a list property holds, in words, with an add beside them while the list can be edited. */
export function PropertyListEntryCount({ fieldId, entryCount, isTheTypesDefault = false, addition }: { fieldId: string; entryCount: number; isTheTypesDefault?: boolean; addition?: { label: string; onAdded: () => void } }) {
  return (
    <div className="flex h-6 min-w-0 items-center gap-1">
      <output id={fieldId} className={cn("min-w-0 flex-1 truncate px-2 text-[11.5px]", valueToneClassName(isTheTypesDefault))}>
        {entryCount === 0 ? "No entries" : entryCount === 1 ? "1 entry" : `${entryCount} entries`}
      </output>
      {addition !== undefined && <IconButton icon={Plus} label={addition.label} size="compact" onPressed={addition.onAdded} data-property-list-entry-add />}
    </div>
  );
}

const PROPERTY_FIELD_CLASS_NAMES = "h-6 w-full min-w-0 rounded-[4px] border-0 bg-studio-control px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** How a value that is not the node's own reads: its type's default, dimmed. */
function valueToneClassName(isTheTypesDefault: boolean): string {
  return isTheTypesDefault ? "text-fg-3" : "text-fg";
}

/** The words a field holds while it is edited: what it shows until it is changed, Enter or leaving it commits, Escape puts it back. */
function useWordsEditedInPlace(shownWords: string, onCommitted: ((words: string) => void) | undefined) {
  const [editedWords, setEditedWords] = useState<string | null>(null);
  const isPuttingTheWordsBack = useRef(false);
  const commit = () => {
    if (!isPuttingTheWordsBack.current && editedWords !== null && editedWords !== shownWords) onCommitted?.(editedWords);
    isPuttingTheWordsBack.current = false;
    setEditedWords(null);
  };
  return {
    value: editedWords ?? shownWords,
    readOnly: onCommitted === undefined,
    onChange: (changeEvent: { target: { value: string } }) => setEditedWords(changeEvent.target.value),
    onBlur: commit,
    onKeyDown: (keyEvent: KeyboardEvent<HTMLInputElement>) => {
      if (keyEvent.key === "Enter") keyEvent.currentTarget.blur();
      if (keyEvent.key === "Escape") {
        isPuttingTheWordsBack.current = true;
        keyEvent.currentTarget.blur();
      }
    },
  };
}

/** A number in a field, centred as Blender draws one, filled from the left up to it where the property's range is known; typed, it commits on Enter or on leaving it. */
export function PropertyNumberField({
  fieldId,
  value,
  minimum,
  maximum,
  isTheTypesDefault = false,
  onCommitted,
}: {
  fieldId: string;
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  isTheTypesDefault?: boolean;
  /** The words typed, which the caller reads as a number; absent for a value that is only shown. */
  onCommitted?: (words: string) => void;
}) {
  const filledFraction = value !== null && minimum !== null && maximum !== null && maximum > minimum ? Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum))) : null;
  const editing = useWordsEditedInPlace(value === null ? "" : String(value), onCommitted);
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[4px] bg-studio-control">
      {filledFraction !== null && <span aria-hidden className="absolute inset-y-0 left-0 bg-studio-property-fill" style={{ width: `${filledFraction * 100}%` }} />}
      <input
        id={fieldId}
        inputMode="decimal"
        {...editing}
        className={cn(PROPERTY_FIELD_CLASS_NAMES, "relative bg-transparent text-center font-mono tabular-nums", valueToneClassName(isTheTypesDefault))}
      />
    </div>
  );
}

/**
 * A number within a known range, dragged on a slider: each move is a live edit and the release commits it once, so
 * one drag is one undo. Its value shows beside it, and LIVE while it is dragged.
 */
export function PropertySliderField({
  fieldId,
  value,
  minimum,
  maximum,
  isWholeNumber,
  isTheTypesDefault = false,
  onDragStarted,
  onLiveEdit,
  onCommitted,
}: {
  fieldId: string;
  value: number | null;
  minimum: number;
  maximum: number;
  isWholeNumber: boolean;
  isTheTypesDefault?: boolean;
  onDragStarted: () => void;
  onLiveEdit: (value: number) => void;
  onCommitted: (value: number) => void;
}) {
  const [draggedValue, setDraggedValue] = useState<number | null>(null);
  const shownValue = draggedValue ?? value ?? minimum;
  const step = isWholeNumber ? 1 : (maximum - minimum) / 100;
  const release = useCallback(() => {
    if (draggedValue !== null) onCommitted(draggedValue);
    setDraggedValue(null);
  }, [draggedValue, onCommitted]);
  useEffect(() => {
    if (draggedValue === null) return undefined;
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [draggedValue, release]);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        id={fieldId}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={shownValue}
        onChange={(changeEvent) => {
          const moved = Number(changeEvent.target.value);
          if (draggedValue === null) onDragStarted();
          setDraggedValue(moved);
          onLiveEdit(moved);
        }}
        onKeyUp={release}
        onBlur={release}
        className="h-4 min-w-0 flex-1 accent-brand"
      />
      <span className={cn("w-10 shrink-0 text-right font-mono text-[11.5px] tabular-nums", valueToneClassName(isTheTypesDefault && draggedValue === null))}>
        {isWholeNumber ? String(shownValue) : shownValue.toFixed(2)}
      </span>
      {draggedValue !== null && (
        <span className="shrink-0 rounded-[3px] bg-brand px-1 text-[10px] font-semibold text-primary-foreground" data-property-live-edit>
          LIVE
        </span>
      )}
    </div>
  );
}

/** Words in a field: a machine word, as a path or an id, in Geist Mono; typed, they commit on Enter or on leaving it. */
export function PropertyTextField({
  fieldId,
  words,
  isMachineWord = true,
  isTheTypesDefault = false,
  label,
  onCommitted,
}: {
  fieldId: string;
  words: string;
  /** The field's accessible name where no label points at it, as "Value of brightness". */
  label?: string;
  isMachineWord?: boolean;
  isTheTypesDefault?: boolean;
  /** Absent for words that are only shown. */
  onCommitted?: (words: string) => void;
}) {
  const editing = useWordsEditedInPlace(words, onCommitted);
  return <input id={fieldId} aria-label={label} {...editing} className={cn(PROPERTY_FIELD_CLASS_NAMES, isMachineWord && "font-mono", valueToneClassName(isTheTypesDefault))} />;
}

/** A name edited in place as a heading: it reads as a title until it is focused, and commits on Enter or on leaving it; a plain heading where it can't be edited. */
export function PropertyHeadingNameField({
  label,
  name,
  onCommitted,
}: {
  /** The field's accessible name, as "Node name". */
  label: string;
  name: string;
  /** Absent for a name that is only shown. */
  onCommitted?: (name: string) => void;
}) {
  const editing = useWordsEditedInPlace(name, onCommitted);
  if (onCommitted === undefined) return <h2 className="min-w-0 truncate px-1 text-[13.5px] leading-7 font-semibold text-fg">{name}</h2>;
  return (
    <input
      aria-label={label}
      {...editing}
      className="h-7 w-full min-w-0 rounded-[4px] border-0 bg-transparent px-1 text-[13.5px] font-semibold text-fg outline-none hover:bg-hover focus:bg-studio-control focus-visible:ring-2 focus-visible:ring-ring"
      data-property-heading-name
    />
  );
}

/** One of a fixed set of values, drawn as the menu it chooses from; read only without `choices`. */
export function PropertyChoiceField({
  fieldId,
  words,
  isTheTypesDefault = false,
  choices,
}: {
  fieldId: string;
  words: string;
  isTheTypesDefault?: boolean;
  /** Each value the menu offers, in words, with what choosing it does. */
  choices?: { words: string; onChosen: () => void }[];
}) {
  const chevron = <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-fg-3" strokeWidth={1.75} />;
  if (choices === undefined) {
    return (
      <div className="relative min-w-0">
        <input id={fieldId} readOnly value={words} className={cn(PROPERTY_FIELD_CLASS_NAMES, "pr-6 font-mono", valueToneClassName(isTheTypesDefault))} />
        {chevron}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger id={fieldId} className={cn(PROPERTY_FIELD_CLASS_NAMES, "relative flex items-center pr-6 text-left font-mono", valueToneClassName(isTheTypesDefault))}>
        <span className="truncate">{words}</span>
        {chevron}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-40">
        {choices.map((choice) => (
          <MenuItem key={choice.words} onChosen={choice.onChosen}>
            <span className="font-mono text-xs">{choice.words}</span>
          </MenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** On or off, as a checkbox; toggled where `onToggled` is given. */
export function PropertyCheckbox({ fieldId, isOn, isTheTypesDefault = false, onToggled }: { fieldId: string; isOn: boolean; isTheTypesDefault?: boolean; onToggled?: (isOn: boolean) => void }) {
  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      <input
        id={fieldId}
        type="checkbox"
        checked={isOn}
        readOnly={onToggled === undefined}
        aria-readonly={onToggled === undefined || undefined}
        className="peer absolute inset-0 m-0 cursor-default opacity-0"
        onClick={(clickEvent) => {
          if (onToggled === undefined) clickEvent.preventDefault();
        }}
        onChange={(changeEvent) => onToggled?.(changeEvent.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-4 items-center justify-center rounded-[3px] peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
          isOn ? (isTheTypesDefault ? "bg-fg-3" : "bg-brand") : "bg-studio-control",
        )}
      >
        {isOn && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
      </span>
    </span>
  );
}

/** A port the node's port can join from a target picker, or one shown greyed with why it cannot. */
export interface PropertyPortTargetChoice {
  /** The node the port is on, by its title. */
  nodeTitle: string;
  port: string;
  /** Why it cannot join, as "Image, can't connect"; `null` for one that can. */
  cannotBecause: string | null;
  /** Names the port apart from every other choice, where two nodes' titles read the same. */
  choiceKey: string;
  onChosen: () => void;
}

/** One target picker of a port: the node and port it is linked with, or a blank one the window added that reads None, and what it lists when opened. */
export interface PropertyPortTarget {
  /** The other end of the link; `null` for a blank picker, which the runtime knows nothing of until a port is chosen. */
  linkedWith: { nodeTitle: string; port: string } | null;
  /** Names the picker apart from the port's others. */
  targetKey: string;
  /** What the picker lists, as "Outputs in Main that carry Channels". */
  note: string;
  /** Read only while the picker is open. */
  choicesWhenOpened: () => PropertyPortTargetChoice[];
  /** Opens its list as it first appears, as a blank picker just added does. */
  isOpenAtFirst?: boolean;
  /** Disconnects the link, or takes a blank picker away. */
  onRemoved: () => void;
}

/** A node's title in bold and, quieter, its port, as a target picker and its choices name a port. */
function NodeAndPortWords({ nodeTitle, port, portClassName }: { nodeTitle: string; port: string; portClassName: string }) {
  return (
    <>
      <Box className="size-[13px] shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
      <b className="min-w-0 truncate font-semibold">{nodeTitle}</b>
      <span className={cn("min-w-0 shrink-[3] truncate", portClassName)}>{port}</span>
    </>
  );
}

/** One target picker of the port `portName`, with ✕ beside it. */
export function PropertyPortTargetPicker({ portName, target }: { portName: string; target: PropertyPortTarget }) {
  const linkedWith = target.linkedWith;
  return (
    <div className="flex min-w-0 items-center gap-1 pl-[17px]" data-property-port-target={linkedWith === null ? "" : `${linkedWith.nodeTitle} › ${linkedWith.port}`}>
      <FieldMenu
        label={linkedWith === null ? `Target of ${portName}: none` : `Target of ${portName}: ${linkedWith.nodeTitle} ${linkedWith.port}`}
        appearance="port_target"
        fillsItsPlace
        menuWidth="wide"
        isOpenAtFirst={target.isOpenAtFirst ?? false}
        words={
          linkedWith === null ? (
            <>
              <Box className="size-[13px] shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
              <span className="text-fg-3">None</span>
            </>
          ) : (
            <NodeAndPortWords nodeTitle={linkedWith.nodeTitle} port={linkedWith.port} portClassName="text-fg-3" />
          )
        }
        data-property-port-target-picker={portName}
      >
        <MenuNote>{target.note}</MenuNote>
        <PropertyPortTargetChoices choices={target.choicesWhenOpened()} />
      </FieldMenu>
      <IconButton
        icon={X}
        label={linkedWith === null ? `Remove the blank target of ${portName}` : `Remove the link of ${portName} with ${linkedWith.nodeTitle} ${linkedWith.port}`}
        size="compact"
        onPressed={target.onRemoved}
        data-property-port-target-remove={portName}
      />
    </div>
  );
}

/** A target picker's choices, drawn only while it is open. */
function PropertyPortTargetChoices({ choices }: { choices: PropertyPortTargetChoice[] }) {
  if (choices.length === 0) return <MenuNote>None in this stream.</MenuNote>;
  return choices.map((choice) => (
    <MenuItem key={choice.choiceKey} isDisabled={choice.cannotBecause !== null} onChosen={choice.onChosen} data-property-port-target-choice={`${choice.nodeTitle} › ${choice.port}`}>
      <NodeAndPortWords nodeTitle={choice.nodeTitle} port={choice.port} portClassName="text-fg-2" />
      {choice.cannotBecause !== null && <span className="ml-auto shrink-0 pl-2 text-2xs text-fg">{choice.cannotBecause}</span>}
    </MenuItem>
  ));
}

/** Which shade a port's band takes, alternating down the panel so each port reads apart from the next. */
export type PropertyPortBandShade = "first" | "second";

const PORT_BAND_SHADE_CLASS_NAMES: Record<PropertyPortBandShade, string> = {
  first: "border-studio-port-band-first-line bg-studio-port-band-first",
  second: "border-studio-port-band-second-line bg-studio-port-band-second",
};

/** A port of the node in a band of its own: its pin, name and family, + to add a target picker, then a picker for each link, or the value an unjoined input holds. */
export function PropertyPortRow({
  direction,
  portName,
  familyWords,
  pinMark,
  meaning,
  bandShade,
  targets,
  addition,
  unlinkedValue,
  refusal = null,
}: {
  direction: "input" | "output";
  portName: string;
  familyWords: string;
  pinMark: ReactNode;
  meaning?: string;
  bandShade: PropertyPortBandShade;
  targets: PropertyPortTarget[];
  /** Adds a blank target picker; absent where the port cannot be edited, and dim with why where it cannot take another link. */
  addition?: { disabledReason: string | null; onAdded: () => void };
  /** The field of the value an unjoined input holds; absent where it takes none. */
  unlinkedValue?: ReactNode;
  refusal?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col" data-properties-port={portName} data-properties-port-direction={direction}>
      <div className={cn("flex min-w-0 flex-col gap-1 rounded-[5px] border pt-[3px] pr-1 pb-[5px] pl-2 text-xs", PORT_BAND_SHADE_CLASS_NAMES[bandShade])}>
        <div className="flex min-h-6 min-w-0 items-center gap-2">
          <WithControlTooltip
            tooltip={meaning}
            isWide
            control={
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {pinMark}
                <span className="truncate text-fg">{portName}</span>
              </span>
            }
          />
          <span className="shrink-0 text-2xs text-fg-3">{familyWords}</span>
          {addition !== undefined && (
            <IconButton icon={Plus} label={`Add a target for ${portName}`} disabledReason={addition.disabledReason} size="compact" onPressed={addition.onAdded} data-property-port-add-target={portName} />
          )}
        </div>
        {targets.length > 0 ? (
          targets.map((target) => <PropertyPortTargetPicker key={target.targetKey} portName={portName} target={target} />)
        ) : (
          <div className="flex min-h-6 min-w-0 items-center truncate pr-1 pl-[17px] text-fg-2">{unlinkedValue ?? <span className="text-fg-3">Not connected</span>}</div>
        )}
      </div>
      {refusal !== null && (
        <div className="pl-2" data-property-refusal>
          <RefusalLine words={refusal} layout="under_field" />
        </div>
      )}
    </div>
  );
}
