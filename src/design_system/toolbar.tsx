// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import type { ControlDataAttributes } from "./control_data_attributes";
import { WithControlTooltip } from "./control_tooltip";

/** A tab's toolbar under its header: its controls in groups on one line, wrapping onto a second in a narrow window rather than cutting a control short. */
export function Toolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="@container relative flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b bg-window px-3 py-1"
    >
      {children}
    </div>
  );
}

/** Controls of a toolbar that belong together; the group at the end sits against the toolbar's right edge. */
export function ToolbarGroup({ isAtTheEnd = false, children }: { isAtTheEnd?: boolean; children: ReactNode }) {
  return <div className={cn("flex shrink-0 items-center gap-0.5", isAtTheEnd && "ml-auto")}>{children}</div>;
}

/** A hairline between two groups of a toolbar's buttons. */
export function ToolbarDivider() {
  return <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-center" />;
}

/** Quiet words in a toolbar, as a count of the lines shown, with what they mean in a tooltip when there is more to say. */
export function ToolbarWords({ explanation, children, ...controlDataAttributes }: { explanation?: ReactNode; children: ReactNode } & ControlDataAttributes) {
  return (
    <WithControlTooltip
      tooltip={explanation}
      control={
        <span className="mr-2 cursor-default text-xs whitespace-nowrap text-fg-3 tabular" {...controlDataAttributes}>
          {children}
        </span>
      }
    />
  );
}
