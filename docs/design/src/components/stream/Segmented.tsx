// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "@/lib/utils"

/** The macOS segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: React.ReactNode; count?: number }[]
  className?: string
}) {
  return (
    <div className={cn("flex h-7 items-center rounded-md bg-well p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 whitespace-nowrap text-fg-2 transition-colors hover:text-fg",
            value === o.id && "bg-raised text-fg shadow-[0_0_0_0.5px_var(--line-strong),0_1px_2px_rgba(0,0,0,0.15)]",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="text-fg-3 tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
