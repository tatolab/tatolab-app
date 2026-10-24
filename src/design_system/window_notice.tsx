// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { SquareX, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";
import { IconButton } from "./icon_button";

/** How a notice reads: plain news, a warning to read (amber), or a failure (red). Plain carries no icon, as a healthy state does not. */
export type WindowNoticeTone = "plain" | "warning" | "failure";

/**
 * A notice raised over the bottom right of the window, about work that finished out of sight: its title, what it says
 * under it, its actions, and Dismiss. A screen reader hears it as it appears.
 */
export function WindowNotice({
  tone,
  title,
  detail,
  actions,
  onDismissed,
  ...controlDataAttributes
}: {
  tone: WindowNoticeTone;
  title: string;
  detail: string;
  actions?: ReactNode;
  onDismissed: () => void;
} & ControlDataAttributes) {
  const ToneIcon = tone === "failure" ? SquareX : tone === "warning" ? TriangleAlert : null;
  return (
    <div
      role={tone === "failure" ? "alert" : "status"}
      className="pointer-events-auto flex w-[360px] max-w-full items-start gap-2.5 rounded-lg bg-raised p-3 shadow-(--shadow-pop)"
      {...controlDataAttributes}
    >
      {ToneIcon !== null && <ToneIcon className={cn("mt-0.5 size-4 shrink-0", tone === "failure" ? "text-danger" : "text-warn")} strokeWidth={1.75} aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-fg">{title}</div>
        <div className={cn("mt-0.5 line-clamp-3 text-xs select-text", tone === "failure" ? "text-danger-text" : tone === "warning" ? "text-warn-text" : "text-fg-2")}>{detail}</div>
        {actions !== undefined && <div className="mt-2.5 flex gap-2">{actions}</div>}
      </div>
      <IconButton icon={X} label="Dismiss" size="compact" onPressed={onDismissed} data-window-notice-action="dismiss" />
    </div>
  );
}
