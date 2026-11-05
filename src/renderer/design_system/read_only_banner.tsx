import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { ControlDataAttributes } from "./control_data_attributes";

/** Says over a canvas that what it shows can be read and not changed here, and why, with the action that would make it editable. */
export function ReadOnlyBanner({ words, action, ...controlDataAttributes }: { words: ReactNode; action?: ReactNode } & ControlDataAttributes) {
  return (
    <div
      role="note"
      className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-studio-read-only/60 bg-studio-read-only-banner py-1.5 pr-1.5 pl-2.5 text-xs text-studio-imports shadow-(--shadow-pop)"
      {...controlDataAttributes}
    >
      <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0">{words}</span>
      {action}
    </div>
  );
}
