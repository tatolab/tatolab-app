// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy } from "lucide-react"
import { useCopy } from "@/components/stream-overview/CopyField"
import { IconButton } from "@/components/stream/primitives"
import { cn } from "@/lib/utils"

/** Shell commands in a well, copyable as a block. */
export function CommandBlock({ commands, empty, wrap, className }: { commands: string[]; empty?: string; wrap?: boolean; className?: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className={cn("relative rounded-md border bg-well", className)}>
      <div className="absolute top-1 right-1">
        <IconButton
          icon={copied === "cli" ? Check : Copy}
          label={copied === "cli" ? "Copied" : commands.length > 1 ? "Copy commands" : "Copy command"}
          onClick={() => copy("cli", commands.join("\n"))}
          className="size-6 [&_svg]:size-3.5"
        />
      </div>
      <pre className={cn("scrollbar-thin overflow-x-auto py-2 pr-9 pl-2.5 font-mono text-xs leading-5 text-fg", wrap && "whitespace-pre-wrap")}>
        {commands.length === 0 ? (
          <span className="text-fg-3">{empty}</span>
        ) : (
          commands.map((c) => (
            <div key={c} className={cn(wrap && "pl-[2ch] -indent-[2ch]")}>
              <span className="text-fg-4 select-none">$ </span>
              {c}
            </div>
          ))
        )}
      </pre>
    </div>
  )
}
