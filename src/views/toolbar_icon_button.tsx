// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { LucideIcon } from "lucide-react";
import { Button } from "./shadcn/button";
import { joinClassNames } from "./shadcn/class_names";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";

/** A tab toolbar's icon button with its name in a tooltip; one that toggles shows pressed while on. `controlAttribute` names it for tests and presets, as `{ "data-stream-graph-toolbar": "previews" }`. */
export function ToolbarIconButton({
  icon: ButtonIcon,
  label,
  tooltip = label,
  isPressed,
  onClick,
  controlAttribute,
}: {
  icon: LucideIcon;
  label: string;
  /** What the tooltip says, when it says more than the button's name. */
  tooltip?: string;
  isPressed?: boolean;
  onClick: () => void;
  controlAttribute: Record<`data-${string}`, string>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-pressed={isPressed}
            className={joinClassNames(isPressed === true && "bg-selected text-fg")}
            onClick={onClick}
            {...controlAttribute}
          />
        }
      >
        <ButtonIcon className="size-4" strokeWidth={1.75} aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** A hairline between groups of a toolbar's buttons. */
export function ToolbarDivider() {
  return <span className="mx-1 h-4 w-px bg-line" aria-hidden />;
}
