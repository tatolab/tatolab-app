import { cn } from "cn";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";

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
    <section
      className="flex min-w-0 flex-col border-b last:border-b-0"
      {...controlDataAttributes}
    >
      <h3 className="m-0">
        <button
          type="button"
          className="flex h-7 w-full items-center gap-1.5 px-2 text-left text-xs font-medium text-fg-2 hover:text-fg"
          aria-expanded={isOpen}
          aria-controls={contentsId}
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronIcon
            className="size-3.5 shrink-0 text-fg-3"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="truncate">{title}</span>
          {aside !== undefined && (
            <span className="ml-auto shrink-0 text-2xs font-normal text-fg-3">
              {aside}
            </span>
          )}
        </button>
      </h3>
      {isOpen && (
        <div
          id={contentsId}
          className="flex min-w-0 flex-col gap-1 px-2 pb-2.5"
        >
          {children}
        </div>
      )}
    </section>
  );
}

/** One property: its name in words in a right-aligned column, what it means while the pointer rests on the name, and its value's field. */
export function PropertyRow({
  label,
  meaning,
  children,
  ...controlDataAttributes
}: {
  label: string;
  meaning?: string;
  children: (fieldId: string) => ReactNode;
} & ControlDataAttributes) {
  const fieldId = useId();
  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-2"
      {...controlDataAttributes}
    >
      <WithControlTooltip
        tooltip={meaning}
        isWide
        control={
          <label
            htmlFor={fieldId}
            className="truncate text-right text-xs text-fg-2"
          >
            {label}
          </label>
        }
      />
      <div className="min-w-0">{children(fieldId)}</div>
    </div>
  );
}

const PROPERTY_FIELD_CLASS_NAMES =
  "h-6 w-full min-w-0 rounded-[4px] border-0 bg-studio-control px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** How a value that is not the node's own reads: its type's default, dimmed. */
function valueToneClassName(isTheTypesDefault: boolean): string {
  return isTheTypesDefault ? "text-fg-3" : "text-fg";
}

/** A number in a field, centred as Blender draws one, filled from the left up to it where the property's range is known. */
export function PropertyNumberField({
  fieldId,
  value,
  minimum,
  maximum,
  isTheTypesDefault = false,
}: {
  fieldId: string;
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  isTheTypesDefault?: boolean;
}) {
  const filledFraction =
    value !== null && minimum !== null && maximum !== null && maximum > minimum
      ? Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)))
      : null;
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[4px] bg-studio-control">
      {filledFraction !== null && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-studio-property-fill"
          style={{ width: `${filledFraction * 100}%` }}
        />
      )}
      <input
        id={fieldId}
        readOnly
        value={value === null ? "" : String(value)}
        className={cn(
          PROPERTY_FIELD_CLASS_NAMES,
          "relative bg-transparent text-center font-mono tabular-nums",
          valueToneClassName(isTheTypesDefault),
        )}
      />
    </div>
  );
}

/** Words in a field: a machine word, as a path or an id, in Geist Mono. */
export function PropertyTextField({
  fieldId,
  words,
  isMachineWord = true,
  isTheTypesDefault = false,
}: {
  fieldId: string;
  words: string;
  isMachineWord?: boolean;
  isTheTypesDefault?: boolean;
}) {
  return (
    <input
      id={fieldId}
      readOnly
      value={words}
      className={cn(
        PROPERTY_FIELD_CLASS_NAMES,
        isMachineWord && "font-mono",
        valueToneClassName(isTheTypesDefault),
      )}
    />
  );
}

/** One of a fixed set of values, drawn as the menu it chooses from. */
export function PropertyChoiceField({
  fieldId,
  words,
  isTheTypesDefault = false,
}: {
  fieldId: string;
  words: string;
  isTheTypesDefault?: boolean;
}) {
  return (
    <div className="relative min-w-0">
      <input
        id={fieldId}
        readOnly
        value={words}
        className={cn(
          PROPERTY_FIELD_CLASS_NAMES,
          "pr-6 font-mono",
          valueToneClassName(isTheTypesDefault),
        )}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-fg-3"
        strokeWidth={1.75}
      />
    </div>
  );
}

/** On or off, as a checkbox. */
export function PropertyCheckbox({
  fieldId,
  isOn,
  isTheTypesDefault = false,
}: {
  fieldId: string;
  isOn: boolean;
  isTheTypesDefault?: boolean;
}) {
  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      <input
        id={fieldId}
        type="checkbox"
        checked={isOn}
        readOnly
        aria-readonly
        className="peer absolute inset-0 m-0 cursor-default opacity-0"
        onClick={(clickEvent) => clickEvent.preventDefault()}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-4 items-center justify-center rounded-[3px] peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
          isOn
            ? isTheTypesDefault
              ? "bg-fg-3"
              : "bg-brand"
            : "bg-studio-control",
        )}
      >
        {isOn && <Check className="size-3 text-white" strokeWidth={3} />}
      </span>
    </span>
  );
}
