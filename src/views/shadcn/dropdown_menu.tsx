// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary
// Adapted from shadcn/ui (MIT): public/licenses/shadcn-ui-MIT.txt.

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { joinClassNames } from "./class_names";

/** shadcn's dropdown menu (base-ui). */
export function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

/** What opens the menu. */
export function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

/** The open menu, placed against its trigger. */
export function DropdownMenuContent({
  align = "start",
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner className="isolate z-50 outline-none" align={align} side={side} sideOffset={sideOffset}>
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={joinClassNames(
            "z-50 min-w-40 origin-(--transform-origin) rounded-lg bg-popover p-1 text-fg shadow-[var(--shadow-pop)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

/** One choice in the menu; `destructive` reads red. */
export function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & { variant?: "default" | "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={joinClassNames(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1 text-sm outline-hidden select-none focus:bg-hover data-[variant=destructive]:text-danger-text data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-fg-3 data-[variant=destructive]:[&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

/** A hairline between groups of choices. */
export function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={joinClassNames("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}
