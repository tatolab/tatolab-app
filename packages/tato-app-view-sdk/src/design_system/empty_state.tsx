import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** What a place shows while it has nothing to show, centred in it: why, in a title and an explanation, and what to do about it. */
export function EmptyState({
  icon: StateIcon,
  isFailure = false,
  title,
  explanation,
  children,
  ...controlDataAttributes
}: {
  icon?: LucideIcon;
  /** Red, for a place empty because something failed. */
  isFailure?: boolean;
  title: string;
  explanation?: ReactNode;
  /** What to do about it, under the words. */
  children?: ReactNode;
} & ControlDataAttributes) {
  return (
    <Empty className="min-h-0 gap-4 rounded-none p-6" {...controlDataAttributes}>
      <EmptyHeader className="max-w-md gap-1">
        {StateIcon !== undefined && (
          <EmptyMedia className="mb-1.5">
            <StateIcon className={cn("size-5", isFailure ? "text-danger" : "text-fg-3")} strokeWidth={1.5} aria-hidden />
          </EmptyMedia>
        )}
        <EmptyTitle className="font-normal tracking-normal text-fg">{title}</EmptyTitle>
        {explanation !== undefined && <EmptyDescription className="text-sm text-fg-3 select-text">{explanation}</EmptyDescription>}
      </EmptyHeader>
      {children !== undefined && <EmptyContent className="max-w-lg">{children}</EmptyContent>}
    </Empty>
  );
}
