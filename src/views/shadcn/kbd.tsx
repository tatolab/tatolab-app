// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Adapted from shadcn/ui (MIT): public/licenses/shadcn-ui-MIT.txt.

import type { ComponentProps } from "react";
import { joinClassNames } from "./class_names";

/** shadcn's keyboard key cap. */
export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={joinClassNames(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center rounded-sm bg-raised px-1 font-sans text-xs font-medium text-fg-3 ring-1 ring-line select-none",
        className,
      )}
      {...props}
    />
  );
}
