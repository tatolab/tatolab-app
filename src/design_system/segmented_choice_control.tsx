// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import type { FocusEvent as ReactFocusEvent, ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ControlDataAttributeName } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** One segment: what choosing it chooses, its label, and the count beside it, if any. */
export interface SegmentedChoice<Choice extends string> {
  choice: Choice;
  label: ReactNode;
  count?: number;
}

/**
 * The macOS segmented control, choosing one of `choices`: a group of pressed buttons, the chosen one raised. The arrow
 * keys move to the segment before or after and choose it, Home and End the first and last; pressing the chosen
 * segment again keeps it chosen.
 */
export function SegmentedChoiceControl<Choice extends string>({
  label,
  choices,
  chosen,
  onChosen,
  dataAttributeOfEachSegment,
}: {
  label: string;
  choices: readonly SegmentedChoice<Choice>[];
  chosen: Choice;
  onChosen: (choice: Choice) => void;
  /** Set on each segment to its choice, as `data-stream-log-level-filter="warn"`. */
  dataAttributeOfEachSegment?: ControlDataAttributeName;
}) {
  const choose = (value: string | undefined) => {
    const chosenSegment = choices.find((segment) => segment.choice === value);
    if (chosenSegment !== undefined && chosenSegment.choice !== chosen) onChosen(chosenSegment.choice);
  };
  // Focus arriving from another segment came by the arrow keys or a press, and chooses; focus arriving by Tab does not.
  const chooseWhenFocusMovesWithin = (focusEvent: ReactFocusEvent<HTMLButtonElement>, choice: Choice) => {
    const cameFrom = focusEvent.relatedTarget;
    if (cameFrom instanceof Node && focusEvent.currentTarget.parentElement?.contains(cameFrom)) choose(choice);
  };
  return (
    <ToggleGroup
      aria-label={label}
      value={[chosen]}
      onValueChange={(pressedValues) => choose(pressedValues[0])}
      size="sm"
      className="h-7 shrink-0 gap-0 rounded-md bg-well p-0.5"
    >
      {choices.map((segment) => (
        <ToggleGroupItem
          key={segment.choice}
          value={segment.choice}
          onFocus={(focusEvent) => chooseWhenFocusMovesWithin(focusEvent, segment.choice)}
          className={cn(
            "h-6 min-w-0 gap-1.5 rounded-[5px] px-2.5 text-sm font-normal text-fg-2 hover:bg-transparent hover:text-fg aria-pressed:bg-raised aria-pressed:text-fg aria-pressed:shadow-(--shadow-segment)",
            FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
          )}
          {...(dataAttributeOfEachSegment === undefined ? {} : { [dataAttributeOfEachSegment]: segment.choice })}
        >
          {segment.label}
          {segment.count !== undefined && <span className="text-fg-2 tabular">{segment.count.toLocaleString("en-US")}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
