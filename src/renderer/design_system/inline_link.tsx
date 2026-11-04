import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** What an inline link does: an action run in place. */
export type InlineLinkDestination = { onPressed: () => void };

/** How an inline link reads: in Tatolab blue where it is the way on, or quiet beside a heading. */
export type InlineLinkTone = "brand" | "quiet";

const TONE_CLASS_NAMES: Record<InlineLinkTone, string> = {
  brand: "text-brand-text underline-offset-2 hover:underline",
  quiet: "text-fg-3 hover:text-fg",
};

/** Words in running text or beside a heading that go somewhere, at the size of the text around them. */
export function InlineLink({
  destination,
  tone = "brand",
  icon: LinkIcon,
  children,
  ...controlDataAttributes
}: { destination: InlineLinkDestination; tone?: InlineLinkTone; icon?: LucideIcon; children: ReactNode } & ControlDataAttributes) {
  const linkClassNames = cn(
    "inline-flex shrink-0 cursor-default items-center gap-1.5 rounded-sm outline-none",
    TONE_CLASS_NAMES[tone],
    FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
  );
  const linkWords = (
    <>
      {LinkIcon !== undefined && <LinkIcon className="size-3.5" strokeWidth={1.75} aria-hidden />}
      {children}
    </>
  );
  return (
    <Button
      variant="link"
      onClick={destination.onPressed}
      className={cn("h-auto border-0 p-0 text-[length:inherit] leading-[inherit] font-normal active:not-aria-[haspopup]:translate-y-0", linkClassNames)}
      {...controlDataAttributes}
    >
      {linkWords}
    </Button>
  );
}
