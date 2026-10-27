import { cn } from "cn";
import { Globe } from "lucide-react";
import { presentExposureLevel } from "../presentation/stream_overview_presentation";

/** A public output's globe and word, its meaning in a tooltip; nothing for an output only this machine or its stream reads. Quiet on a line of quiet meta words. */
export function PublicExposureTag({ level, isQuiet = false }: { level: string; isQuiet?: boolean }) {
  if (level !== "public") return null;
  const exposureLevel = presentExposureLevel(level);
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs", isQuiet ? "text-fg-3" : "text-fg-2")} title={exposureLevel.meaning ?? undefined}>
      <Globe className="size-3.5 text-fg-3" strokeWidth={1.75} aria-hidden />
      {exposureLevel.label}
    </span>
  );
}
