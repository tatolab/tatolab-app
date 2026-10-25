// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "cn";
import { useId, type ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";
import { RefusalLine } from "./refusal_line";

/** A group of settings rows in one frame, hairlines between them, under a title and a line saying what they are, when it has them. */
export function SettingsGroup({ title, description, children, ...controlDataAttributes }: { title?: string; description?: ReactNode; children: ReactNode } & ControlDataAttributes) {
  const titleId = useId();
  return (
    <section aria-labelledby={title === undefined ? undefined : titleId} className="flex flex-col gap-2" {...controlDataAttributes}>
      {title !== undefined && (
        <div className="px-1">
          <h2 id={titleId} className="font-medium">
            {title}
          </h2>
          {description !== undefined && <p className="text-xs text-fg-3">{description}</p>}
        </div>
      )}
      <div className="flex flex-col divide-y rounded-lg border bg-window">{children}</div>
    </section>
  );
}

/**
 * One setting: its name and what it does on the left, its control or value on the right, and, under both, why the last
 * change was refused. The control is labelled by the name and described by the words beside it.
 */
export function SettingsRow({
  label,
  description,
  control,
  refusal = null,
  children,
  ...controlDataAttributes
}: {
  label: ReactNode;
  description?: ReactNode;
  /** Given the ids of the name and the description, for the control to be labelled and described by. */
  control?: (labelledBy: { labelId: string; descriptionId: string | undefined }) => ReactNode;
  /** Why the last change was refused: the refusing side's own words after the window's lead naming what was refused. */
  refusal?: { lead: string; words: string } | null;
  /** What the row holds under its name, across its whole width. */
  children?: ReactNode;
} & ControlDataAttributes) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="flex flex-col gap-2 px-4 py-3" {...controlDataAttributes}>
      <div className="flex min-h-7 items-center gap-5">
        <div className="min-w-0 flex-1">
          <p id={labelId}>{label}</p>
          {description !== undefined && (
            <div id={descriptionId} className={cn("text-xs text-fg-3 select-text", "[&_code]:font-mono [&_code]:text-fg-2")}>
              {description}
            </div>
          )}
        </div>
        {control !== undefined && (
          <div className="flex shrink-0 items-center gap-1.5">{control({ labelId, descriptionId: description === undefined ? undefined : descriptionId })}</div>
        )}
      </div>
      {children}
      {refusal !== null && <RefusalLine lead={refusal.lead} words={refusal.words} />}
    </div>
  );
}
