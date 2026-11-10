import { cn } from "cn";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** How big a grid's cards are: compact inside a studio area, regular on a page of its own. */
export type CardGridSize = "studio_compact" | "page";

const CARD_GRID_SIZE_CLASS_NAMES: Record<CardGridSize, string> = {
  studio_compact: "grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2",
  page: "grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3.5",
};

/** Cards in as many equal columns as fit, each at least its size's width, rows as tall as their cards. */
export function CardGrid({ size, label, children, ...controlDataAttributes }: { size: CardGridSize; label: string; children: ReactNode } & ControlDataAttributes) {
  return (
    <div role="group" aria-label={label} className={cn("grid auto-rows-min", CARD_GRID_SIZE_CLASS_NAMES[size])} {...controlDataAttributes}>
      {children}
    </div>
  );
}
