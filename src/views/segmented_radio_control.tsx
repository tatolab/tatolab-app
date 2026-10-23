// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { joinClassNames } from "./shadcn/class_names";

/** One segment of a segmented control: what choosing it chooses, its label, and the count beside it, if any. */
export interface SegmentedRadioChoice<Choice extends string> {
  choice: Choice;
  label: ReactNode;
  count?: number;
  /** Names the segment for tests and presets, as `{ "data-stream-log-level-filter": "warn" }`. */
  controlAttribute?: Record<`data-${string}`, string>;
}

const ARROW_KEY_STEPS: Record<string, -1 | 1> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/**
 * A segmented control that chooses one of `choices`, as a radio group: only the chosen segment is a Tab stop, and the
 * arrow keys choose the segment before or after it.
 */
export function SegmentedRadioControl<Choice extends string>({
  ariaLabel,
  choices,
  chosen,
  onChosen,
}: {
  ariaLabel: string;
  choices: readonly SegmentedRadioChoice<Choice>[];
  chosen: Choice;
  onChosen: (choice: Choice) => void;
}) {
  const segmentButtons = useRef(new Map<Choice, HTMLButtonElement>());
  const onKeyDown = (keyboardEvent: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_KEY_STEPS[keyboardEvent.key];
    if (step === undefined) return;
    keyboardEvent.preventDefault();
    const chosenIndex = choices.findIndex((segment) => segment.choice === chosen);
    const nextSegment = choices[(chosenIndex + step + choices.length) % choices.length];
    if (nextSegment === undefined) return;
    onChosen(nextSegment.choice);
    segmentButtons.current.get(nextSegment.choice)?.focus();
  };
  return (
    <div className="flex h-7 shrink-0 items-center rounded-md bg-well p-0.5" role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {choices.map((segment) => {
        const isChosen = segment.choice === chosen;
        return (
          <button
            key={segment.choice}
            ref={(segmentButton) => {
              if (segmentButton === null) segmentButtons.current.delete(segment.choice);
              else segmentButtons.current.set(segment.choice, segmentButton);
            }}
            type="button"
            role="radio"
            aria-checked={isChosen}
            tabIndex={isChosen ? 0 : -1}
            onClick={() => onChosen(segment.choice)}
            className={joinClassNames(
              "flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 whitespace-nowrap text-fg-2 transition-colors hover:text-fg focus-visible:ring-3 focus-visible:ring-ring",
              isChosen && "bg-raised text-fg shadow-(--shadow-segment)",
            )}
            {...segment.controlAttribute}
          >
            {segment.label}
            {segment.count !== undefined && <span className="text-fg-2 tabular">{segment.count.toLocaleString("en-US")}</span>}
          </button>
        );
      })}
    </div>
  );
}
