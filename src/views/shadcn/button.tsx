// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Adapted from shadcn/ui (MIT): public/licenses/shadcn-ui-MIT.txt.

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { joinClassNames } from "./class_names";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border-line-strong bg-raised text-fg hover:bg-hover",
        ghost: "text-fg-2 hover:bg-hover hover:text-fg",
        destructive: "bg-danger text-primary-foreground hover:bg-danger/90 dark:bg-danger-soft dark:text-danger dark:hover:bg-danger/15",
      },
      size: {
        default: "h-7 px-2.5",
        icon: "size-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

/** shadcn's button (base-ui), in the window's tokens. */
export function Button({ className, variant, size, ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={joinClassNames(buttonVariants({ variant, size, className }))} {...props} />;
}
