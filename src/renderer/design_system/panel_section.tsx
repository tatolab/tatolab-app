import { cn } from "cn";
import type { ReactNode } from "react";

/** A titled group of a side panel or details panel, with what belongs beside its title; divided from the next where a panel stacks many. */
export function PanelSection({
  title,
  aside,
  isDivided = false,
  isTheTopHeading = false,
  children,
}: {
  title: string;
  aside?: ReactNode;
  isDivided?: boolean;
  /** For a section of a panel with no title of its own, whose sections are its top headings. */
  isTheTopHeading?: boolean;
  children: ReactNode;
}) {
  const SectionHeading = isTheTopHeading ? "h2" : "h3";
  return (
    <section className={cn("flex min-w-0 flex-col p-2", isDivided && "border-b last:border-b-0")}>
      <div className="flex h-8 shrink-0 items-center gap-2 px-2">
        <SectionHeading className="label-caps truncate">{title}</SectionHeading>
        {aside !== undefined && <div className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-fg-3">{aside}</div>}
      </div>
      <div className="min-w-0 px-2 pb-1">{children}</div>
    </section>
  );
}
