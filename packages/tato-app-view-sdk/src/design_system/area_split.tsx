import type { ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";

/** One part of a split: its id, its share of the split in percent, and what it shows. */
export interface AreaSplitPart {
  part_id: string;
  size_percent: number;
  content: ReactNode;
}

/** The smallest share a part is dragged down to, so an area never closes by a drag. */
const AREA_SPLIT_PART_MINIMUM_PERCENT = 8;

/**
 * Parts side by side (`row`) or stacked (`column`), parted by the window's frame, each border dragged to resize them;
 * `onSizesChanged` hears each part's share, by id, once a drag ends.
 */
export function AreaSplit({
  label,
  direction,
  parts,
  onSizesChanged,
}: {
  label: string;
  direction: "row" | "column";
  parts: readonly AreaSplitPart[];
  onSizesChanged: (sizePercentByPartId: Record<string, number>) => void;
}) {
  return (
    <ResizablePanelGroup
      aria-label={label}
      orientation={direction === "row" ? "horizontal" : "vertical"}
      defaultLayout={Object.fromEntries(parts.map((part) => [part.part_id, part.size_percent]))}
      onLayoutChanged={(layout) => onSizesChanged({ ...layout })}
      className="min-h-0 min-w-0"
    >
      {parts.flatMap((part, partIndex) => [
        ...(partIndex === 0
          ? []
          : [
              <ResizableHandle
                key={`${part.part_id}-border`}
                className="w-(--studio-area-gap) bg-studio-frame focus-visible:bg-ring aria-[orientation=horizontal]:h-(--studio-area-gap)"
              />,
            ]),
        <ResizablePanel key={part.part_id} id={part.part_id} minSize={`${AREA_SPLIT_PART_MINIMUM_PERCENT}%`} className="min-h-0 min-w-0">
          {part.content}
        </ResizablePanel>,
      ])}
    </ResizablePanelGroup>
  );
}
