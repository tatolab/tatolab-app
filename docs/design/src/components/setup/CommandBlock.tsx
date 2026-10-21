// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { IconButton } from "@/components/stream/primitives"
import { cn } from "@/lib/utils"

function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }
  return { copied, copy }
}

/** One shell command in a well, with a copy button. */
export function CommandBlock({ command, className }: { command: string; className?: string }) {
  const { copied, copy } = useCopy(command)
  return (
    <div className={cn("flex h-9 items-center gap-2 rounded-md border bg-well pr-1 pl-3 font-mono text-[13px]", className)}>
      <span className="text-fg-4 select-none">$</span>
      <span className="min-w-0 flex-1 truncate text-fg">{command}</span>
      <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} onClick={copy} />
    </div>
  )
}

const pyKeywords = new Set(["from", "import", "def", "class", "return", "with", "as", "for", "in", "if", "else", "None", "True", "False", "async", "await"])

type Token = { text: string; tone: string }

function tokenize(line: string, language: "python" | "json" | "shell"): Token[] {
  const out: Token[] = []
  const re = /(#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*|\s+|.)/g
  let match: RegExpExecArray | null
  let previous = ""
  while ((match = re.exec(line))) {
    const text = match[0]
    let tone = "text-fg"
    if (text.startsWith("#") && language !== "json") tone = "text-fg-4 italic"
    else if (text.startsWith('"') || text.startsWith("'")) tone = language === "json" && line.slice(match.index + text.length).trimStart().startsWith(":") ? "text-fg" : "text-fg-2"
    else if (/^\d/.test(text)) tone = "text-fg-2"
    else if (language === "python" && pyKeywords.has(text)) tone = "text-brand-text"
    else if (language === "python" && /^[A-Z]/.test(text)) tone = "text-brand-text"
    else if (language === "shell" && previous === "") tone = "text-brand-text"
    else if (/^[^\w\s]$/.test(text)) tone = "text-fg-3"
    if (text.trim()) previous = text
    out.push({ text, tone })
  }
  return out
}

/** A read-only code block with quiet syntax tint and a copy button. */
export function CodeBlock({
  code,
  language = "python",
  caption,
  className,
}: {
  code: string
  language?: "python" | "json" | "shell"
  caption?: React.ReactNode
  className?: string
}) {
  const { copied, copy } = useCopy(code)
  return (
    <div className={cn("overflow-hidden rounded-md border bg-well", className)}>
      {caption && (
        <div className="flex h-8 items-center gap-2 border-b pr-1 pl-3 text-xs text-fg-3">
          <span className="min-w-0 flex-1 truncate font-mono">{caption}</span>
          <IconButton icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} onClick={copy} className="size-6" />
        </div>
      )}
      <pre className="scrollbar-thin overflow-x-auto px-3 py-2.5 font-mono text-xs">
        {code.split("\n").map((line, i) => (
          <div key={i} className="min-h-4 whitespace-pre">
            {tokenize(line, language).map((t, j) => (
              <span key={j} className={t.tone}>
                {t.text}
              </span>
            ))}
          </div>
        ))}
      </pre>
    </div>
  )
}
