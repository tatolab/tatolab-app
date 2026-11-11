import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** How a panel section sits in its panel: on the panel itself, or as a card raised off it. */
export type PanelSectionAppearance = "plain" | "card";

/** A titled group of a side panel or details panel, with what belongs beside its title; divided from the next where a panel stacks many. */
export function PanelSection({
  title,
  icon: TitleIcon,
  aside,
  appearance = "plain",
  isDivided = false,
  isTheTopHeading = false,
  children,
}: {
  title: string;
  /** Drawn before the title of a card. */
  icon?: LucideIcon;
  aside?: ReactNode;
  appearance?: PanelSectionAppearance;
  isDivided?: boolean;
  /** For a section of a panel with no title of its own, whose sections are its top headings. */
  isTheTopHeading?: boolean;
  children: ReactNode;
}) {
  const SectionHeading = isTheTopHeading ? "h2" : "h3";
  if (appearance === "card") {
    return (
      <section className="mx-3 my-3 flex min-w-0 flex-col rounded-lg border bg-window">
        <div className="flex h-9 shrink-0 items-center gap-2 px-3">
          {TitleIcon !== undefined && <TitleIcon className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.75} aria-hidden />}
          <SectionHeading className="truncate text-xs font-medium text-fg-2">{title}</SectionHeading>
          {aside !== undefined && <div className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-fg-3">{aside}</div>}
        </div>
        <div className="min-w-0 px-3 pb-2">{children}</div>
      </section>
    );
  }
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

/** One line of a panel's list: its icon, its name, what trails it, and a quiet line under it. */
export function PanelListRow({
  icon,
  name,
  trailing,
  detail,
  detailWraps = false,
  ...controlDataAttributes
}: {
  /** An icon element, so a row can draw it in its own tone. */
  icon: ReactNode;
  name: ReactNode;
  trailing?: ReactNode;
  detail?: ReactNode;
  /** Wraps the detail line instead of cutting it short, for words that must be read whole, such as a refusal. */
  detailWraps?: boolean;
} & ControlDataAttributes) {
  return (
    <li className="flex min-w-0 gap-2.5 py-1.5" {...controlDataAttributes}>
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] text-fg">{name}</span>
          {trailing !== undefined && <span className="ml-auto shrink-0 text-xs text-fg-3">{trailing}</span>}
        </div>
        {detail !== undefined && <div className={cn("mt-0.5 min-w-0 text-xs text-fg-3", detailWraps ? "break-words" : "truncate")}>{detail}</div>}
      </div>
    </li>
  );
}
