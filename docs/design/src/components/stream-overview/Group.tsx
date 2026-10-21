// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "@/lib/utils"

/** A sidebar-style group: small label, actions beside it, content on the same inset. */
export function Group({ label, actions, children, className }: { label: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col p-2", className)}>
      <div className="flex h-8 shrink-0 items-center gap-1 px-2">
        <span className="text-xs font-medium text-fg-3">{label}</span>
        {actions && <div className="ml-auto flex items-center gap-0.5">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
