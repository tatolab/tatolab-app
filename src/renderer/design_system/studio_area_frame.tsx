import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";
import { studioIconNamed, type StudioIconName } from "./studio_icons";

/** One area of the studio: a rounded pane on the window's frame, its header over the view it shows. */
export function StudioAreaFrame({ label, header, children, ...controlDataAttributes }: { label: string; header: ReactNode; children: ReactNode } & ControlDataAttributes) {
  return (
    <section aria-label={label} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-studio-area" {...controlDataAttributes}>
      <div className="flex h-(--studio-area-header-height) shrink-0 items-center gap-1.5 border-b border-studio-area-header-line bg-studio-area-header px-1.5">
        {header}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** The menu at an area header's start that says what the area shows and changes it. */
export function StudioAreaHeaderMenu({
  icon,
  words,
  label,
  children,
  ...controlDataAttributes
}: {
  icon: StudioIconName;
  words: string;
  /** The button's accessible name, saying what choosing does. */
  label: string;
  children: ReactNode;
} & ControlDataAttributes) {
  const HeaderIcon = studioIconNamed(icon);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-[22px] gap-1.5 rounded-sm bg-studio-control px-1.5 text-studio font-normal text-fg hover:bg-studio-control-open data-popup-open:bg-studio-control-open",
              FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
            )}
          />
        }
        aria-label={label}
        {...controlDataAttributes}
      >
        <HeaderIcon className="size-3.5 text-fg-2" strokeWidth={1.5} aria-hidden />
        {words}
        <ChevronDown className="size-3 text-fg-3" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[300px]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
