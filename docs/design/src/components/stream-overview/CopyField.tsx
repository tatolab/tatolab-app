// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { IconButton } from "@/components/stream/primitives"
import { cn } from "@/lib/utils"

export function useCopy() {
  const [copied, setCopied] = useState<string>()
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(key)
    window.setTimeout(() => setCopied((c) => (c === key ? undefined : c)), 1400)
  }
  return { copied, copy }
}

/** A read-only mono value with a copy button, as in Vercel's domain rows. */
export function CopyField({ value, className }: { value: string; className?: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className={cn("flex h-7 min-w-0 items-center rounded-md border bg-well pr-0.5 pl-2.5", className)}>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={value}>
        {value}
      </span>
      <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} onClick={() => copy("v", value)} className="size-6" />
    </div>
  )
}
