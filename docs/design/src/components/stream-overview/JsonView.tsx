// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { Json } from "./model"

type Tone = "key" | "string" | "number" | "literal" | "punct"
type Token = { text: string; tone: Tone }
type Line = { indent: number; tokens: Token[]; anchor?: string }

const toneClass: Record<Tone, string> = {
  key: "text-fg",
  string: "text-fg-2",
  number: "text-brand-text",
  literal: "text-brand-text/80 italic",
  punct: "text-fg-4",
}

function scalar(v: Json): Token {
  if (typeof v === "string") return { text: JSON.stringify(v), tone: "string" }
  if (typeof v === "number") return { text: String(v), tone: "number" }
  return { text: String(v), tone: "literal" }
}

function isComposite(v: Json): v is Json[] | { [k: string]: Json } {
  return typeof v === "object" && v !== null
}

function linesOf(value: Json, indent: number, lead: Token[], trailingComma: boolean, anchor?: string): Line[] {
  const comma: Token[] = trailingComma ? [{ text: ",", tone: "punct" }] : []
  if (!isComposite(value)) return [{ indent, tokens: [...lead, scalar(value), ...comma], anchor }]
  const array = Array.isArray(value)
  const entries: [string | null, Json][] = array ? value.map((v) => [null, v]) : Object.entries(value)
  const [open, close] = array ? ["[", "]"] : ["{", "}"]
  if (!entries.length) return [{ indent, tokens: [...lead, { text: open + close, tone: "punct" }, ...comma], anchor }]
  const out: Line[] = [{ indent, tokens: [...lead, { text: open, tone: "punct" }], anchor }]
  entries.forEach(([k, v], i) => {
    const keyTokens: Token[] = k === null ? [] : [{ text: JSON.stringify(k), tone: "key" }, { text: ": ", tone: "punct" }]
    out.push(...linesOf(v, indent + 1, keyTokens, i < entries.length - 1, indent === 0 && k ? k : undefined))
  })
  out.push({ indent, tokens: [{ text: close, tone: "punct" }, ...comma] })
  return out
}

export function JsonRaw({ value, highlight }: { value: Json; highlight?: string }) {
  const lines = linesOf(value, 0, [], false)
  const gutter = String(lines.length).length
  return (
    <div className="min-w-max py-2 font-mono text-[12px] leading-5">
      {lines.map((line, i) => (
        <div
          key={i}
          id={line.anchor ? `inspect-${line.anchor}` : undefined}
          className={cn("flex scroll-mt-2 pr-6 hover:bg-hover", line.anchor && line.anchor === highlight && "bg-brand-soft hover:bg-brand-soft")}
        >
          <span className="shrink-0 pr-4 pl-4 text-right text-fg-4 tabular select-none" style={{ width: `calc(${gutter}ch + 2.5rem)` }}>
            {i + 1}
          </span>
          <span className="whitespace-pre" style={{ paddingLeft: `${line.indent * 2}ch` }}>
            {line.tokens.map((t, j) => (
              <span key={j} className={toneClass[t.tone]}>
                {t.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

function summary(v: Json) {
  if (Array.isArray(v)) return `[${v.length}]`
  return `{${Object.keys(v as object).length}}`
}

function TreeNode({ name, value, path, depth, open, toggle, highlight }: {
  name: string
  value: Json
  path: string
  depth: number
  open: Set<string>
  toggle: (p: string) => void
  highlight?: string
}) {
  const composite = isComposite(value)
  const expanded = open.has(path)
  const isAnchor = depth === 0
  return (
    <div id={isAnchor ? `inspect-${name}` : undefined} className="scroll-mt-2">
      <div
        onClick={() => composite && toggle(path)}
        className={cn(
          "flex h-[22px] cursor-default items-center gap-1 pr-4 hover:bg-hover",
          isAnchor && name === highlight && "bg-brand-soft hover:bg-brand-soft",
        )}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        {composite ? (
          <ChevronRight className={cn("size-3.5 shrink-0 text-fg-3 transition-transform", expanded && "rotate-90")} strokeWidth={1.75} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="text-fg">{name}</span>
        <span className="text-fg-4">:</span>
        {composite ? (
          <span className="text-fg-3">{summary(value)}</span>
        ) : (
          <span className={cn("truncate", toneClass[scalar(value).tone])}>{scalar(value).text}</span>
        )}
      </div>
      {composite && expanded && (
        <div className="relative">
          <span className="absolute top-0 bottom-0 w-px bg-line" style={{ left: 18 + depth * 16 }} />
          {(Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)).map(([k, v]) => (
            <TreeNode key={k} name={k} value={v} path={`${path}.${k}`} depth={depth + 1} open={open} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  )
}

export function JsonTree({ value, highlight }: { value: { [k: string]: Json }; highlight?: string }) {
  const [open, setOpen] = useState(() => new Set(["$.machine", "$.state", "$.nodes", "$.nodes.0", "$.exposed"]))
  const toggle = (p: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  return (
    <div className="py-2 font-mono text-[12px]">
      {Object.entries(value).map(([k, v]) => (
        <TreeNode key={k} name={k} value={v} path={`$.${k}`} depth={0} open={open} toggle={toggle} highlight={highlight} />
      ))}
    </div>
  )
}

export function describe(v: Json) {
  if (Array.isArray(v)) return `${v.length}`
  if (isComposite(v)) return `${Object.keys(v).length}`
  return typeof v === "string" ? v : String(v)
}
