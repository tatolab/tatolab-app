// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

/** A sidebar group in the shadcn Sidebar's spacing: 8px padding, 32px label row, actions on the right. */
export function PanelGroup({
  label,
  actions,
  children,
  collapsible,
  defaultOpen = true,
  className,
  contentClassName,
}: {
  label: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  className?: string
  contentClassName?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const head = (
    <>
      {collapsible && <ChevronRight className={cn("size-3.5 shrink-0 text-fg-3 transition-transform duration-150", open && "rotate-90")} strokeWidth={2} />}
      <span className="truncate">{label}</span>
    </>
  )
  return (
    <div className={cn("flex min-w-0 flex-col p-2", className)}>
      <div className="flex h-8 shrink-0 items-center gap-1 pr-0.5">
        {collapsible ? (
          <button onClick={() => setOpen((o) => !o)} className="-ml-0.5 flex h-6 min-w-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fg-3 hover:text-fg-2">
            {head}
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-1 px-2 text-xs font-medium text-fg-3">{head}</div>
        )}
        {actions && <div className="ml-auto flex shrink-0 items-center gap-0.5">{actions}</div>}
      </div>
      {open && <div className={cn("min-w-0", contentClassName)}>{children}</div>}
    </div>
  )
}

/** A 28px sidebar row. */
export function panelRowClass(active?: boolean) {
  return cn(
    "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-[13px] text-fg-2 transition-colors hover:bg-hover hover:text-fg",
    active && "bg-selected font-medium text-fg",
  )
}
