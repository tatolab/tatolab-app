import { cn } from "cn";
import { Box, ChevronDown, ChevronRight, FolderOpen, LocateFixed, LogIn, RotateCcw, Unlink, X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";
import { RefusalLine } from "./refusal_line";
import { IconButton } from "./icon_button";
import { MenuItem, MenuNote } from "./menus";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { MatchedWords } from "./matched_words";
import type { PinType } from "../pin_type_readings";
import { pinTypeKeyOfTheType } from "../pin_model/pin_type_words";

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
  searchWords = "",
  children,
  ...controlDataAttributes
}: {
  label: string;
  meaning?: string;
  /** What a search field over the properties holds: the part of the name it matches is marked. */
  searchWords?: string;
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
              <MatchedWords words={label} searchWords={searchWords} />
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

const PROPERTY_FIELD_CLASS_NAMES = "h-6 w-full min-w-0 rounded-[4px] border-0 bg-studio-control px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A property field's look on a box holding its input, ringed while the input inside holds the keyboard's focus. */
const PROPERTY_FIELD_HOLDING_AN_INPUT_CLASS_NAMES = "h-6 w-full min-w-0 rounded-[4px] bg-studio-control px-2 text-[11.5px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";

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

/** The socket colour of the pin type `pinType` as a mark before its words, as a choice of a type shows each it offers. */
function PinTypeMark({ pinType }: { pinType: PinType }) {
  return <span aria-hidden className="node-graph-pin-mark shrink-0" data-pin-type={pinTypeKeyOfTheType(pinType)} data-property-pin-type-mark="" />;
}

/** One of a fixed set of values, drawn as the menu it chooses from; read only without `choices`. A choice of a pin type marks the type held and each type offered with its socket's colour. */
export function PropertyChoiceField({
  fieldId,
  words,
  pinType,
  label,
  isTheTypesDefault = false,
  choices,
  whyItOffersNoChoice,
}: {
  fieldId: string;
  words: string;
  /** The pin type the field holds, when it chooses one, whose socket colour marks its words. */
  pinType?: PinType;
  /** The field's accessible name where no label points at it, as "Value of blend". */
  label?: string;
  isTheTypesDefault?: boolean;
  /** Each value the menu offers, in words, with the pin type it is when it is one, what its tooltip says of it, and what choosing it does. */
  choices?: { words: string; pinType?: PinType; tooltip?: string; onChosen: () => void }[];
  /** What the menu says while `choices` is empty. */
  whyItOffersNoChoice?: string;
}) {
  const chevron = <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-fg-3" strokeWidth={1.75} />;
  if (choices === undefined) {
    return (
      <div className={cn(PROPERTY_FIELD_HOLDING_AN_INPUT_CLASS_NAMES, "relative flex items-center gap-1.5 pr-6")}>
        {pinType !== undefined && <PinTypeMark pinType={pinType} />}
        <input id={fieldId} aria-label={label} readOnly value={words} className={cn("min-w-0 flex-1 bg-transparent font-mono outline-none", valueToneClassName(isTheTypesDefault))} />
        {chevron}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger id={fieldId} aria-label={label} className={cn(PROPERTY_FIELD_CLASS_NAMES, "relative flex items-center gap-1.5 pr-6 text-left font-mono", valueToneClassName(isTheTypesDefault))}>
        {pinType !== undefined && <PinTypeMark pinType={pinType} />}
        <span className="truncate">{words}</span>
        {chevron}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-40">
        {choices.length === 0 && whyItOffersNoChoice !== undefined && <MenuNote>{whyItOffersNoChoice}</MenuNote>}
        {choices.map((choice, index) => (
          <MenuItem key={`${index}-${choice.words}`} tooltip={choice.tooltip} onChosen={choice.onChosen} leading={choice.pinType === undefined ? undefined : <PinTypeMark pinType={choice.pinType} />}>
            <span className="font-mono text-xs">{choice.words}</span>
          </MenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Two fields that set one value, side by side and sharing the row's width, as a choice of a type and the narrowing beside it. */
export function PropertyFieldsSideBySide({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 gap-1 *:min-w-0 *:flex-1">{children}</div>;
}

/** How a field naming a project asset opens the asset picker: the button's name, why it cannot now, and what pressing it does. */
export interface PropertyAssetChoosing {
  label: string;
  disabledReason: string | null;
  onChooseAsked: () => void;
}

/** A field naming a project asset: a small picture of the asset when it has one, its words read only, and an icon button beside them that opens the asset picker, left out where `choosing` is not given, with one that names no asset where `clearing` is. */
export function PropertyAssetField({
  fieldId,
  words,
  label,
  previewPictureUrl,
  isTheTypesDefault = false,
  choosing,
  clearing,
}: {
  fieldId: string;
  words: string;
  /** The field's accessible name where no label points at it, as "Value of footage". */
  label?: string;
  /** A `data:` URL of the asset's preview picture, `null` while it has none or none is read yet. */
  previewPictureUrl: string | null;
  isTheTypesDefault?: boolean;
  choosing?: PropertyAssetChoosing;
  clearing?: { label: string; onCleared: () => void };
}) {
  return (
    <div className="flex min-w-0 items-center gap-1" data-property-asset-field="">
      <div className={cn(PROPERTY_FIELD_HOLDING_AN_INPUT_CLASS_NAMES, "flex items-center gap-1.5 pl-0.5")}>
        {previewPictureUrl !== null && (
          <img src={previewPictureUrl} alt="" draggable={false} className="h-5 w-[30px] shrink-0 rounded-[3px] bg-well object-cover" data-property-asset-picture="" />
        )}
        <input id={fieldId} aria-label={label} readOnly value={words} title={words} className={cn("min-w-0 flex-1 bg-transparent font-mono outline-none", previewPictureUrl === null && "pl-1.5", valueToneClassName(isTheTypesDefault))} />
      </div>
      {clearing !== undefined && <IconButton icon={X} label={clearing.label} size="compact" onPressed={clearing.onCleared} data-property-asset-clear="" />}
      {choosing !== undefined && <IconButton icon={FolderOpen} label={choosing.label} disabledReason={choosing.disabledReason} size="compact" onPressed={choosing.onChooseAsked} data-property-asset-choose="" />}
    </div>
  );
}

/** The node and port at a link's other end: the node's title in bold and, quieter, its port, with what can be done to the link from here. */
export interface PropertyPortLinkedEnd {
  nodeTitle: string;
  port: string;
  /** Names the link apart from the port's others, where two nodes' titles read the same. */
  linkKey: string;
  /** Selects the node at the other end; absent where the row offers no way there. */
  jump?: { label: string; onJumped: () => void };
  /** Takes the link out; absent where the graph can't be edited. */
  disconnection?: { label: string; onDisconnected: () => void };
}

/** The row under a port's name that holds a link's other end, an input's description or the value an unjoined input holds, indented to sit under the name. */
const PORT_BAND_DETAIL_ROW_CLASS_NAME = "flex min-h-6 min-w-0 items-center pr-1 pl-[17px]";

/** One link of a port, named by the node and port at its other end, with a way to that node and a way to take the link out where each is given; links are made on the canvas. */
function PropertyPortLinkedEndLine({ linkedEnd }: { linkedEnd: PropertyPortLinkedEnd }) {
  return (
    <div className={cn(PORT_BAND_DETAIL_ROW_CLASS_NAME, "gap-1.5")} data-property-port-linked-end={`${linkedEnd.nodeTitle} › ${linkedEnd.port}`}>
      <Box className="size-[13px] shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />
      <span className="flex min-w-0 items-center gap-1.5" title={`${linkedEnd.nodeTitle} › ${linkedEnd.port}`}>
        <b className="min-w-0 truncate font-semibold">{linkedEnd.nodeTitle}</b>
        <span className="min-w-[3ch] shrink-[3] truncate text-fg-3">{linkedEnd.port}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center">
        {linkedEnd.jump !== undefined && <IconButton icon={LocateFixed} label={linkedEnd.jump.label} size="compact" onPressed={linkedEnd.jump.onJumped} data-property-port-linked-end-jump />}
        {linkedEnd.disconnection !== undefined && <IconButton icon={Unlink} label={linkedEnd.disconnection.label} size="compact" onPressed={linkedEnd.disconnection.onDisconnected} data-property-port-linked-end-disconnect />}
      </span>
    </div>
  );
}

/** Which shade a port's band takes, alternating down the panel so each port reads apart from the next. */
export type PropertyPortBandShade = "first" | "second";

const PORT_BAND_SHADE_CLASS_NAMES: Record<PropertyPortBandShade, string> = {
  first: "border-studio-port-band-first-line bg-studio-port-band-first",
  second: "border-studio-port-band-second-line bg-studio-port-band-second",
};

/**
 * A port of the node in a band of its own: its pin, name and type, where an input's value comes from and what can be done
 * to it, then its description, and the other end of each of its links or the value an unjoined input holds.
 */
export function PropertyPortRow({
  direction,
  portName,
  typeWords,
  pinMark,
  meaning,
  bandShade,
  linkedEnds,
  description,
  comesFromWords,
  unlinkedValue,
  wireReading,
  reset,
  promotion,
  refusal = null,
  searchWords = "",
}: {
  direction: "input" | "output";
  portName: string;
  /** What a search field over the properties holds: the part of the port's name it matches is marked. */
  searchWords?: string;
  /** Its type and flow in words; a port with no exact type says so. */
  typeWords: string;
  /** The mark before its name, in a slot as wide on every row, so every name lines up. */
  pinMark: ReactNode;
  meaning?: string;
  bandShade: PropertyPortBandShade;
  linkedEnds: readonly PropertyPortLinkedEnd[];
  /** What its node type says it means; absent where it says nothing. */
  description?: string;
  /** Where the value an unjoined input shows comes from, in a word; absent where it reads none. */
  comesFromWords?: string;
  /** The field of the value an unjoined input holds; absent where it takes none. */
  unlinkedValue?: ReactNode;
  /** The control that shows what the wire carries into an input holding no value of its own, under its wire, its row hidden while the table has none for it; absent where none may draw it. */
  wireReading?: ReactNode;
  /** Takes the input's own value off, so it reads its default; absent while it holds none or can't be edited. */
  reset?: { label: string; onReset: () => void };
  /** Feeds the input from a new Graph Input of the stream; absent where it can't be. */
  promotion?: { label: string; onPromoted: () => void };
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
              <span className="flex min-w-12 flex-1 items-center gap-1.5">
                {pinMark}
                <span className="truncate text-fg" data-properties-port-name>
                  <MatchedWords words={portName} searchWords={searchWords} />
                </span>
              </span>
            }
          />
          {comesFromWords !== undefined && (
            <span className="shrink-0 text-2xs text-fg-3" data-properties-input-comes-from>
              {comesFromWords}
            </span>
          )}
          <span className="min-w-0 truncate text-2xs text-fg-3" title={typeWords} data-properties-port-type-words>
            {typeWords}
          </span>
          {(reset !== undefined || promotion !== undefined) && (
            <span className="flex shrink-0 items-center">
              {reset !== undefined && <IconButton icon={RotateCcw} label={reset.label} size="compact" onPressed={reset.onReset} data-properties-input-reset />}
              {promotion !== undefined && <IconButton icon={LogIn} label={promotion.label} size="compact" onPressed={promotion.onPromoted} data-properties-input-promote />}
            </span>
          )}
        </div>
        {description !== undefined && (
          <p className={cn(PORT_BAND_DETAIL_ROW_CLASS_NAME, "m-0 text-2xs text-fg-3")} data-properties-input-description>
            {description}
          </p>
        )}
        {linkedEnds.length > 0 ? (
          linkedEnds.map((linkedEnd) => <PropertyPortLinkedEndLine key={linkedEnd.linkKey} linkedEnd={linkedEnd} />)
        ) : (
          <div className={cn(PORT_BAND_DETAIL_ROW_CLASS_NAME, "truncate text-fg-2")}>{unlinkedValue ?? <span className="text-fg-3">Not connected</span>}</div>
        )}
        {/* The row hides while its control's slot shows `no_control`, matched by its start since an underscore in a class names a space. */}
        {wireReading !== undefined && (
          <div className={cn(PORT_BAND_DETAIL_ROW_CLASS_NAME, "has-[[data-input-control-shows^=no]]:hidden")} data-properties-input-wire-reading>
            {wireReading}
          </div>
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
