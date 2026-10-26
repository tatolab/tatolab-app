import { cn } from "cn";
import { Infinity as InfinityIcon, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { isStreamLoaded, presentStreamRunMode } from "../presentation/stream_presentation";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** Always on or Dev session, with what it means and the runtime's own term in its tooltip; a dash for a stream with neither. */
export function StreamRunModeWords({ stream }: { stream: ListedStream }) {
  const runMode = presentStreamRunMode(stream);
  if (runMode === null) return <span className="text-fg-3">—</span>;
  const RunModeIcon = runMode.runMode === "dev_session" ? RefreshCw : InfinityIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`${runMode.label}: ${runMode.meaning} The runtime calls it ${runMode.runtimeTerm}.`}
        className={cn(
          "inline-flex cursor-default items-center gap-1.5 rounded-sm outline-none",
          isStreamLoaded(stream) ? "text-fg-2" : "text-fg-3",
          FULL_STRENGTH_FOCUS_RING_CLASS_NAMES,
        )}
      >
        <RunModeIcon className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />
        {runMode.label}
      </TooltipTrigger>
      <TooltipContent className="block max-w-64">
        {runMode.meaning}
        <span className="mt-1 block font-mono text-2xs opacity-70">runtime: {runMode.runtimeTerm}</span>
      </TooltipContent>
    </Tooltip>
  );
}
