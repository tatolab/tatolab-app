// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";

/** A key cap naming a keyboard shortcut, as ⌘ F; raised, so it reads on a well as on a panel. */
export function KeyboardKey({ children }: { children: ReactNode }) {
  return (
    <Kbd className="bg-raised text-fg-3 ring-1 ring-line" aria-hidden>
      {children}
    </Kbd>
  );
}
