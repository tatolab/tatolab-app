import { cn } from "cn";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** What a status chip says about its record: done well, refused or failed, live or needing care, or plain. */
export type StatusChipTone = "positive" | "danger" | "caution" | "neutral";

const STATUS_CHIP_TONE_CLASSES: Record<StatusChipTone, string> = {
  positive: "bg-status-positive-ground text-status-positive-text",
  danger: "bg-status-danger-ground text-status-danger-text",
  caution: "bg-status-caution-ground text-status-caution-text",
  neutral: "bg-status-neutral-ground text-status-neutral-text",
};

/** A short word naming a record's status, as `applied` or `live`, on a small ground of its tone; the word carries the status, the colour only repeats it. */
export function StatusChip({ tone, children, ...controlDataAttributes }: { tone: StatusChipTone; children: ReactNode } & ControlDataAttributes) {
  return (
    <span className={cn("inline-block rounded-[3px] px-1.5 py-px text-2xs leading-4 whitespace-nowrap", STATUS_CHIP_TONE_CLASSES[tone])} data-status-chip-tone={tone} {...controlDataAttributes}>
      {children}
    </span>
  );
}
