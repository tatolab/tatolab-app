import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** How long the pointer rests on a control before its tooltip shows; one tooltip shown, the next shows at once. */
const TOOLTIP_OPEN_DELAY_MILLISECONDS = 300;

/** Shares one open delay across every tooltip in the window; mounted once at its root. */
export function ControlTooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipProvider delay={TOOLTIP_OPEN_DELAY_MILLISECONDS}>{children}</TooltipProvider>;
}

/** `control` with `tooltip` beside it while the pointer rests on it, or while it holds keyboard focus when it can take it; `control` alone without one. */
export function WithControlTooltip({ tooltip, control, isWide = false }: { tooltip: ReactNode | undefined; control: ReactElement; isWide?: boolean }) {
  if (tooltip === undefined) return control;
  return (
    <Tooltip>
      <TooltipTrigger render={control} />
      <TooltipContent className={isWide ? "max-w-64" : undefined}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
