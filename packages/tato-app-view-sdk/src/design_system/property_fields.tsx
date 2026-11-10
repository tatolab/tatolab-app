import { cn } from "cn";
import { Check, ChevronDown, ChevronRight, Minus, Plus, RotateCcw, X } from "lucide-react";
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
      <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)_1.5rem] items-center gap-2">
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
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_1.5rem] gap-2" data-property-refusal>
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
  return (
    <div className="flex min-w-0 flex-col gap-1" {...controlDataAttributes}>
      <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)_1.5rem] items-center gap-2">
        <span className="truncate text-right text-xs font-medium text-fg-2">{label}</span>
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

/** A port another one can join from the Connect menu, or one shown greyed with why it cannot. */
export interface PropertyPortConnectChoice {
  /** The port in words, as "Mic Levels › level". */
  words: string;
  /** Why it cannot join, as "Image, can't connect"; `null` for one that can. */
  cannotBecause: string | null;
  /** Names the port apart from every other choice, where two nodes' titles read the same. */
  choiceKey: string;
  onChosen: () => void;
}

/** The Connect ▾ menu of a port: the ports of this stream it can join, under a note saying which they are. */
export function PropertyPortConnectMenu({
  portName,
  note,
  choicesWhenOpened,
}: {
  portName: string;
  /** What the menu lists, as "Outputs in Main that carry Channels". */
  note: string;
  /** Read only while the menu is open. */
  choicesWhenOpened: () => PropertyPortConnectChoice[];
}) {
  return (
    <FieldMenu label={`Connect ${portName}`} words="Connect" size="compact" menuWidth="wide" menuAlignment="end" data-property-port-connect={portName}>
      <MenuNote>{note}</MenuNote>
      <PropertyPortConnectChoices choices={choicesWhenOpened()} />
    </FieldMenu>
  );
}

/** The Connect menu's choices, drawn only while it is open. */
function PropertyPortConnectChoices({ choices }: { choices: PropertyPortConnectChoice[] }) {
  if (choices.length === 0) return <MenuNote>None in this stream.</MenuNote>;
  return choices.map((choice) => (
    <MenuItem key={choice.choiceKey} isDisabled={choice.cannotBecause !== null} onChosen={choice.onChosen} data-property-port-connect-choice={choice.words}>
      <span className="min-w-0 flex-1 truncate">{choice.words}</span>
      {choice.cannotBecause !== null && <span className="shrink-0 text-2xs text-fg">{choice.cannotBecause}</span>}
    </MenuItem>
  ));
}

/** One linked end of a port, in words, with what disconnects it. */
export interface PropertyPortLinkedEnd {
  /** The node at the other end, by its title. */
  nodeTitle: string;
  port: string;
  /** Names the link apart from the port's other links, where two nodes' titles read the same. */
  linkKey: string;
  onDisconnect: () => void;
}

/**
 * A port of the node: its name, its family in words, its Connect menu, and each link it has with a ✕ that disconnects
 * it, or the value an unjoined input holds.
 */
export function PropertyPortRow({
  direction,
  portName,
  familyWords,
  pinMark,
  meaning,
  linkedEnds,
  unlinkedValue,
  connectMenu,
  refusal = null,
}: {
  direction: "input" | "output";
  portName: string;
  familyWords: string;
  pinMark: ReactNode;
  meaning?: string;
  linkedEnds: PropertyPortLinkedEnd[];
  /** The field of the value an unjoined input holds; absent where it takes none. */
  unlinkedValue?: ReactNode;
  connectMenu?: ReactNode;
  refusal?: string | null;
}) {
  const linkWords = direction === "input" ? "from" : "to";
  return (
    <div className="flex min-w-0 flex-col" data-properties-port={portName} data-properties-port-direction={direction}>
      <div className="flex min-w-0 flex-col gap-0.5 rounded-[5px] bg-studio-port-row py-1 pr-1 pl-2 text-xs">
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
          {connectMenu !== undefined && <span className="flex shrink-0 items-center">{connectMenu}</span>}
        </div>
        {linkedEnds.length > 0 ? (
          <ul className="flex min-w-0 flex-col" data-properties-port-linked={linkedEnds.map((end) => `${end.nodeTitle} › ${end.port}`).join(", ")}>
            {linkedEnds.map((end) => (
              <li key={end.linkKey} className="flex min-h-6 min-w-0 items-center gap-1 pl-4 text-fg-2">
                <span className="min-w-0 flex-1 truncate">
                  {linkWords} <b className="font-semibold text-fg">{end.nodeTitle}</b> › {end.port}
                </span>
                <IconButton
                  icon={X}
                  label={`Disconnect ${portName} ${linkWords} ${end.nodeTitle} › ${end.port}`}
                  size="compact"
                  onPressed={end.onDisconnect}
                  data-property-port-disconnect={`${portName}:${end.nodeTitle} › ${end.port}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="min-w-0 truncate pr-1 pl-4 text-fg-2">{unlinkedValue ?? <span className="text-fg-3">Not connected</span>}</div>
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
