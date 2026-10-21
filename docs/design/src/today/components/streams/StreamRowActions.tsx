// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Copy, Ellipsis, FolderOpen, type LucideIcon, Play, RotateCw, Square, Trash2, Workflow } from "lucide-react"
import { useNavigate } from "react-router-dom"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { TodayStream } from "../../data"
import { todayStreamCommand } from "./StreamStateWords"

function StreamRowActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  filled,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  disabled?: boolean
  filled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="button"
            aria-label={label}
            aria-disabled={disabled}
            onClick={disabled ? undefined : onClick}
            className={cn(
              "grid size-7 place-items-center rounded-md text-fg-3 transition-colors",
              disabled ? "cursor-default text-fg-4" : "hover:bg-hover hover:text-fg",
            )}
          />
        }
      >
        <Icon className={cn("size-4", filled && "size-3 fill-current")} strokeWidth={1.75} />
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Stop / Start or Retry, Reload, Open graph and a menu with the rest, for one row of the streams table. */
export function StreamRowActions({ stream }: { stream: TodayStream }) {
  const navigate = useNavigate()
  const attached = stream.state === "attached"
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {stream.loaded ? (
        <StreamRowActionButton
          icon={Square}
          filled
          disabled={attached}
          label={attached ? "Ends with its terminal: stop it where tatolab dev runs" : "Stop"}
        />
      ) : (
        <StreamRowActionButton icon={Play} filled label={stream.state === "failed" ? "Retry" : "Start"} />
      )}
      <StreamRowActionButton
        icon={RotateCw}
        disabled={!stream.loaded || attached}
        label={attached ? "Reloads on save under tatolab dev" : stream.loaded ? "Reload: compile stream.py again and restart" : "Not loaded"}
      />
      <StreamRowActionButton
        icon={Workflow}
        disabled={!stream.loaded}
        label={stream.loaded ? "Open graph" : "No graph: the stream is not loaded"}
        onClick={() => navigate(`/streams/${stream.id}/graph`)}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              aria-label="More"
              className="grid size-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-selected data-popup-open:text-fg"
            />
          }
        >
          <Ellipsis className="size-4" strokeWidth={1.75} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-mono text-xs">{stream.id}</DropdownMenuLabel>
            <DropdownMenuItem>
              <FolderOpen /> Open project folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void navigator.clipboard?.writeText(todayStreamCommand(stream)).catch(() => undefined)}>
              <Copy /> Copy <span className="font-mono text-xs">tatolab</span> command
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">
            <Trash2 /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
