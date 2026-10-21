// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Aperture, Maximize2, Play, PictureInPicture2 } from "lucide-react"
import { ExposureLabel, IconButton, KindIcon, Preview } from "@/components/stream/primitives"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { StreamSpec } from "@/data/mock"
import { AudioLevels } from "./AudioLevels"
import { isAudioOutput, isRunning, portAddress, type StreamOutput } from "./model"

function OutputPicker({ outputs, value, onChange }: { outputs: StreamOutput[]; value: string; onChange: (key: string) => void }) {
  const items = outputs.map((o) => ({
    value: o.key,
    label: (
      <span className="flex min-w-0 items-center gap-1.5">
        <KindIcon kind={o.port.kind} />
        <span className="text-fg">{o.node.label}</span>
        <span className="truncate font-mono text-xs text-fg-3">{o.port.name}</span>
      </span>
    ),
  }))
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger size="sm" className="h-7 max-w-96 min-w-0 rounded-md border-line bg-window pl-2 text-[13px] dark:bg-window dark:hover:bg-hover">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className="w-auto min-w-64 rounded-md p-1 shadow-[var(--shadow-pop)] ring-0">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className="h-7 rounded-[5px] text-[13px]">
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Overlay({ stream }: { stream: StreamSpec }) {
  if (stream.status === "paused")
    return (
      <div className="absolute inset-0 grid place-items-center bg-black/60">
        <div className="flex flex-col items-center gap-3">
          <Button size="sm" className="h-7 gap-1.5 px-3 text-[13px]">
            <Play className="size-3.5" /> Start stream
          </Button>
          <span className="text-xs text-white/60">{stream.statusDetail}</span>
        </div>
      </div>
    )
  return null
}

export function OutputViewer({
  stream,
  outputs,
  selected,
  onSelect,
  actions,
  meta,
  overlay,
  empty,
}: {
  stream: StreamSpec
  outputs: StreamOutput[]
  selected?: StreamOutput
  onSelect: (key: string) => void
  actions?: React.ReactNode
  meta?: React.ReactNode
  overlay?: React.ReactNode
  empty?: React.ReactNode
}) {
  const live = isRunning(stream)
  const audio = isAudioOutput(selected)
  const caption = selected ? portAddress(stream, selected.node.id, selected.port.name) : undefined
  const spectrum = outputs.find((o) => o.scene === "spectrum")
  return (
    <div className="w-full max-w-[920px]">
      <div className="mb-2.5 flex items-center gap-3">
        {selected && <OutputPicker outputs={outputs} value={selected.key} onChange={onSelect} />}
        {selected && <ExposureLabel exposure={selected.exposure} className="text-xs" />}
        <div className="ml-auto flex items-center gap-0.5">
          {actions !== undefined ? actions : (
            <>
              <IconButton icon={PictureInPicture2} label="Pop out" />
              <IconButton icon={Aperture} label={audio ? "Save 10 s clip" : "Snapshot"} />
              <IconButton icon={Maximize2} label="Full screen" />
            </>
          )}
        </div>
      </div>
      {!selected ? (
        (empty !== undefined ? empty : <div className="grid aspect-video place-items-center rounded-md bg-well text-fg-3 ring-1 ring-line">This stream has no previewable output.</div>)
      ) : audio ? (
        <div className="flex gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="relative">
              <Preview scene={selected.scene!} paused={!live} className="aspect-[21/8]" />
              {overlay !== undefined ? overlay : <Overlay stream={stream} />}
            </div>
            {spectrum && spectrum.key !== selected.key && (
              <div className="relative">
                <Preview scene="spectrum" paused={!live} className="h-24" />
                <span className="absolute top-1.5 left-2.5 font-mono text-[11px] text-white/70">
                  {portAddress(stream, spectrum.node.id, spectrum.port.name)}
                </span>
              </div>
            )}
          </div>
          <div className="rounded-md border bg-chrome px-2.5 pt-3 pb-2">
            <AudioLevels live={live} />
          </div>
        </div>
      ) : (
        <div className="relative">
          <Preview scene={selected.scene!} paused={!live} className="aspect-video" />
          {overlay !== undefined ? overlay : <Overlay stream={stream} />}
        </div>
      )}
      <div className="mt-1.5 flex h-5 items-center gap-3 text-xs">
        <span className="min-w-0 truncate font-mono text-fg-3">{caption}</span>
        {meta !== undefined ? meta : (
          <span className="ml-auto shrink-0 text-fg-3 tabular">
            {stream.resolution}
            {live && (
              <>
                {" · "}
                {audio ? `${stream.fps} blocks/s` : `${stream.fps} fps`} · {stream.endToEndMs} ms end to end
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
