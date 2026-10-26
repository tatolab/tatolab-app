import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";

/** A key cap naming a keyboard shortcut, as ⌘ F; raised, so it reads on a well as on a panel. */
export function KeyboardKey({
  isAlreadyAnnounced = false,
  children,
}: {
  /** For a cap beside a control whose `aria-keyshortcuts` already names the shortcut to a screen reader. */
  isAlreadyAnnounced?: boolean;
  children: ReactNode;
}) {
  return (
    <Kbd className="bg-raised text-fg-3 ring-1 ring-line" aria-hidden={isAlreadyAnnounced || undefined}>
      {children}
    </Kbd>
  );
}
