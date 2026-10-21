// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/** A titled box of settings rows, as in macOS System Settings. */
export function SettingsGroup({ title, description, children, className }: { title?: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {(title || description) && (
        <div className="px-1">
          {title && <h2 className="font-medium text-fg">{title}</h2>}
          {description && <p className="text-xs text-fg-3">{description}</p>}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border bg-raised">{children}</div>
    </section>
  )
}

export function SettingsRow({ label, description, children, className }: { label: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-12 items-center gap-6 border-b px-4 py-2.5 last:border-b-0", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-fg">{label}</div>
        {description && <div className="text-xs text-fg-3">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

export function SettingsSelect({ value, options, className }: { value: string; options: string[]; className?: string }) {
  return (
    <Select defaultValue={value}>
      <SelectTrigger size="sm" className={cn("h-7 min-w-44 rounded-md text-[13px]", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-[13px]">
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
