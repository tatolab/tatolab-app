// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { logs as mockLogs, machineById, type StreamSpec, streams } from "@/data/mock"

export type LogLevel = "debug" | "info" | "warn" | "error"
export type FieldValue = string | number | boolean

/** One line of the runtime's JSONL log. */
export interface LogLine {
  id: string
  ts: string
  level: LogLevel
  stream: string | null
  node: string | null
  pid: number
  msg: string
  fields: Record<string, FieldValue>
  traceback?: string
}

export const runtimePid: Record<string, number> = {
  "studio-mac": 1207,
  "garage-jetson": 902,
  "dock-box": 1544,
  "lobby-tv": 611,
  "render-pod": 88,
}

export function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export type Rand = ReturnType<typeof rand>

export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const int = (r: Rand, a: number, b: number) => Math.floor(a + r() * (b - a + 1))
const num = (r: Rand, a: number, b: number, dp = 1) => +(a + r() * (b - a)).toFixed(dp)

type Draft = { level: LogLevel; node: string | null; msg: string; fields?: Record<string, FieldValue>; traceback?: string; gapMs?: number; pid?: number }
type Template = { w: number; make: (r: Rand, c: Counters) => Draft }
type Counters = Record<string, number>

const d = (level: LogLevel, node: string | null, msg: string, fields?: Record<string, FieldValue>, extra?: Partial<Draft>): Draft => ({
  level,
  node,
  msg,
  fields,
  ...extra,
})
const bump = (c: Counters, k: string, start: number, by = 1) => (c[k] = (c[k] ?? start) + by)

const steady: Record<string, Template[]> = {
  "front-door": [
    { w: 6, make: (r) => d("info", "persondetector", "people in frame", { count: int(r, 0, 3), best: num(r, 0.82, 0.97, 2) }) },
    { w: 1.2, make: (r) => d("warn", "persondetector", "frame arrived late; newest-profile drained stale frames", { dropped: int(r, 1, 3), behind_ms: int(r, 34, 58) }) },
    { w: 2, make: (r, c) => d("debug", "h264encoder", "keyframe", { group: bump(c, "group", 1120), bytes: int(r, 121000, 159000) }) },
    { w: 1, make: (r) => (r() > 0.5 ? d("info", "doorbell", "presence started", { zone: "porch" }) : d("info", "doorbell", "presence ended", { zone: "porch", held_s: num(r, 1.2, 9.8) })) },
    { w: 1.4, make: (r, c) => d("info", "mp4sink", "fragment written", { file: "/data/front-door/2026-10-20.mp4", seq: bump(c, "frag", 8810), bytes: int(r, 2100000, 2980000) }) },
    { w: 1, make: (r) => d("debug", "camera", "auto exposure", { ev: num(r, -0.7, 0.7), gain_db: int(r, 0, 9) }) },
    { w: 0.6, make: (r) => d("debug", "boxoverlay", "dispatch", { ms: num(r, 2.8, 3.9, 2), boxes: int(r, 0, 3) }) },
    { w: 0.5, make: (r) => d("info", null, "relay heartbeat", { relay: "cloudflare", rtt_ms: int(r, 19, 31) }) },
  ],
  "studio-voice": [
    { w: 4, make: (r) => d("debug", "denoise", "vad", { speech: num(r, 0.05, 0.99, 2), noise_db: num(r, -64, -58) }) },
    { w: 1, make: (r) => d("info", "denoise", "noise profile updated", { floor_db: num(r, -63, -59), bands: 32 }) },
    { w: 2.5, make: (r, c) => d("debug", "opusencoder", "packet", { seq: bump(c, "pkt", 390120, 50), bytes: int(r, 180, 262), frame_ms: 20 }) },
    { w: 1, make: () => d("info", "roomreverb", "parameters applied", { room: "small-warm", wet: 0.18, decay_s: 0.6 }) },
    { w: 0.5, make: () => d("warn", "speaker", "output underrun; inserted silence", { samples: 960, device: "Studio monitors" }) },
    { w: 1.2, make: (r) => d("debug", "microphone", "clock drift corrected", { ppm: num(r, -12, 12) }) },
    { w: 0.6, make: (r) => d("info", null, "relay heartbeat", { relay: "cloudflare", rtt_ms: int(r, 18, 29) }) },
  ],
  "halftone-booth": [
    { w: 4, make: (r) => d("debug", "halftone", "dispatch", { ms: num(r, 0.8, 1.4, 2), size: "1280x720" }) },
    { w: 1.5, make: (r) => d("debug", "camera", "auto exposure", { ev: num(r, -0.5, 0.9), gain_db: int(r, 0, 6) }) },
    { w: 1, make: (r) => d("debug", "virtualcamera", "frame served", { client: "zoom.us", queue: int(r, 0, 2) }) },
    { w: 0.12, make: () => d("info", "virtualcamera", "client connected", { client: "zoom.us", format: "BGRA 1280x720@60" }) },
  ],
  "dock-4": [
    { w: 3, make: (r, c) => d("info", "peoplecounter", "crossings", { in: int(r, 0, 3), out: int(r, 0, 2), today: bump(c, "today", 1408, int(r, 1, 3)) }) },
    { w: 2.4, make: (r) => d("warn", "peoplecounter", "over frame budget", { took_ms: num(r, 56, 68), budget_ms: 33.3 }) },
    { w: 1.2, make: (r) => d("warn", null, "link dropping messages", { link: "camera.video -> peoplecounter.video_from_upstream", dropped_per_min: int(r, 151, 174), profile: "newest" }) },
    { w: 2, make: (r) => d("debug", "heatmap", "rendered", { ms: num(r, 3.6, 4.6) }) },
    { w: 0.6, make: (r) => d("warn", "camera", "RTSP packet loss", { lost: int(r, 1, 4), url: "rtsp://10.0.4.21/main" }) },
    { w: 1, make: (r) => d("debug", "camera", "RTSP keepalive", { rtt_ms: int(r, 2, 6) }) },
    { w: 0.5, make: (r) => d("info", null, "relay heartbeat", { relay: "moqpro", rtt_ms: int(r, 34, 44) }) },
  ],
  "lobby-wall": [
    { w: 3, make: (r, c) => d("debug", "frontdoor", "group received", { group: bump(c, "fg", 40210), bytes: int(r, 61000, 98000), behind_ms: int(r, 22, 38) }) },
    { w: 3, make: (r, c) => d("debug", "dock", "group received", { group: bump(c, "dg", 18802), bytes: int(r, 54000, 90000), behind_ms: int(r, 30, 47) }) },
    { w: 2, make: (r) => d("debug", "mosaic", "composed", { ms: num(r, 5.4, 6.8), tiles: 2 }) },
    { w: 0.6, make: (r) => d("warn", "dock", "group arrived late; skipped to newest", { behind_ms: int(r, 180, 260) }) },
    { w: 0.5, make: () => d("info", "decoder", "stream reconfigured", { codec: "h264", profile: "high", size: "2560x1440" }) },
    { w: 0.5, make: () => d("info", null, "relay heartbeat", { relay: "local", rtt_ms: 1 }) },
  ],
  "test-pattern": [
    { w: 3, make: (r) => d("debug", "invertingeffect", "dispatch", { ms: num(r, 0.3, 0.6, 2), size: "1280x720" }) },
    { w: 1, make: (r, c) => d("debug", "testpatternsource", "frame", { seq: bump(c, "seq", 0, 30), pattern: "smpte" , drift_us: int(r, 0, 40) }) },
  ],
  "lobby-recorder": [
    { w: 2, make: (r, c) => d("info", "mp4sink", "fragment written", { file: "//nas/lobby/2026-10-20.mp4", seq: bump(c, "frag", 2210), bytes: int(r, 1800000, 2400000) }) },
    { w: 1.5, make: (r) => d("debug", "mp4sink", "nas write", { ms: int(r, 6, 22) }) },
    { w: 2, make: (r) => d("debug", "camera", "frame timing", { interval_ms: num(r, 32.9, 33.8, 2), late: 0 }) },
  ],
}

const endTimes: Record<string, string> = {
  "front-door": "2026-10-20T21:14:02.880Z",
  "studio-voice": "2026-10-20T21:14:08.402Z",
  "halftone-booth": "2026-10-20T21:14:07.115Z",
  "dock-4": "2026-10-20T21:14:06.551Z",
  "lobby-wall": "2026-10-20T21:14:05.240Z",
  "test-pattern": "2026-10-18T16:41:22.016Z",
  "lobby-recorder": "2026-10-20T03:13:11.508Z",
}

function nodePid(stream: StreamSpec, nodeId: string | null) {
  const n = stream.nodes.find((x) => x.id === nodeId)
  if (n?.pid) return n.pid
  if (n && n.origin !== "built-in") return 50000 + (hash(stream.id + n.id) % 9000)
  return runtimePid[stream.machine] ?? 1
}

function startup(stream: StreamSpec): Draft[] {
  const out: Draft[] = [
    d("info", null, "loading stream", { project: stream.project, entry: stream.entry }),
    d("info", null, "graph validated", { steps: stream.nodes.length, links: stream.links.length }),
  ]
  for (const n of stream.nodes) {
    if (n.origin === "built-in") out.push(d("info", n.id, "started", { class: n.className }))
    else out.push(d("info", null, "spawned step process", { node: n.id, pid: nodePid(stream, n.id), python: stream.python }))
  }
  out.push(d("info", null, "stream running", { steps: stream.nodes.length }))
  return out
}

const tracebackLobby = `Traceback (most recent call last):
  File "/opt/streams/lobby-recorder/stream.py", line 21, in <module>
    rt.run()
  File "/opt/tatolab/lib/python3.12/site-packages/tatolab/stream/_runtime.py", line 214, in run
    self._engine.run_until_stopped()
tatolab.stream.StepFailed: step 'camera' (tatolab.stream:CameraSource) failed: no camera at /dev/video0 (ENODEV)
  the device was removed at 03:12:07 and did not come back after 7 restarts`

const tracebackDock = `Traceback (most recent call last):
  File "/opt/streams/dock-counter/.venv/lib/python3.11/site-packages/warehouse_pack/nodes/people_counter.py", line 118, in process
    tracks = self._tracker.update(self._model(frame.tensor()))
  File "/opt/streams/dock-counter/.venv/lib/python3.11/site-packages/warehouse_pack/tracker.py", line 64, in update
    embeddings = self._reid(crops)
torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 512.00 MiB (GPU 0; 19.70 GiB total; 212.00 MiB free)`

const tracebackHalftone = `Traceback (most recent call last):
  File "/Users/jonathan/streams/halftone-booth/nodes/halftone.py", line 31, in setup
    self.kernel = ctx.gpu.compile_compute(SHADER)
tatolab.stream.ShaderCompileError: halftone.comp:42: 'ink_rgb' : undeclared identifier`

function scripted(stream: StreamSpec, r: Rand): { at: number; lines: Draft[] }[] {
  switch (stream.id) {
    case "halftone-booth":
      return [
        {
          at: 30,
          lines: [
            d("info", null, "file changed", { file: "nodes/halftone.py" }),
            d("info", null, "stopping step", { node: "halftone", pid: 52061 }),
            d("info", null, "spawned step process", { node: "halftone", pid: 52088, python: "3.13" }),
            d("error", "halftone", "setup failed", { file: "nodes/halftone.py", line: 31 }, { traceback: tracebackHalftone, pid: 52088 }),
            d("warn", null, "reload failed; kept the previous version running", { node: "halftone", pid: 52061 }),
          ],
        },
        {
          at: 70,
          lines: [
            d("info", null, "file changed", { file: "nodes/halftone.py" }),
            d("info", null, "stopping step", { node: "halftone", pid: 52061 }),
            d("info", null, "spawned step process", { node: "halftone", pid: 52110, python: "3.13" }),
            d("info", "halftone", "shader compiled", { stage: "compute", ms: 84 }),
            d("warn", "halftone", "config key set but unused by shader", { key: "angle_deg" }),
            d("info", null, "reloaded", { node: "halftone", ms: 412 }),
          ],
        },
      ]
    case "dock-4":
      return [
        {
          at: 44,
          lines: [
            d("error", "peoplecounter", "process raised", { exc: "torch.OutOfMemoryError" }, { traceback: tracebackDock, pid: 3088 }),
            d("warn", null, "step process exited", { node: "peoplecounter", pid: 3088, exit_code: 1 }),
            d("info", null, "restarting step", { node: "peoplecounter", attempt: 2, backoff_ms: 500 }, { gapMs: 520 }),
            d("info", null, "spawned step process", { node: "peoplecounter", pid: 3121, python: "3.11" }),
            d("info", "peoplecounter", "model loaded", { model: "counter-r50.engine", provider: "TensorRT", ms: 1840 }, { gapMs: 1860 }),
          ],
        },
        { at: 90, lines: [d("warn", null, "relay key expires soon", { relay: "moqpro", days: 6 })] },
      ]
    case "test-pattern":
      return [
        { at: 0, lines: startup(stream) },
        {
          at: 999,
          lines: [
            d("info", null, "stop requested", { by: "tatolab stop" }),
            d("info", null, "step process exited", { node: "invertingeffect", pid: nodePid(stream, "invertingeffect"), exit_code: 0 }),
            d("info", null, "stream stopped", { code: 0 }),
          ],
        },
      ]
    case "lobby-recorder": {
      const tail: Draft[] = [
        d("error", "camera", "device disconnected", { device: "/dev/video0", errno: "ENODEV" }),
        d("info", "mp4sink", "fragment closed early", { file: "//nas/lobby/2026-10-20.mp4", seq: 2318 }),
        d("warn", null, "step failed", { node: "camera", policy: "always-on" }),
      ]
      let backoff = 500
      for (let attempt = 1; attempt <= 7; attempt++) {
        tail.push(d("info", null, "restarting stream", { attempt, backoff_ms: backoff }, { gapMs: 30 }))
        tail.push(d("error", "camera", "no camera at /dev/video0", { errno: "ENODEV", searched: "v4l2" }, { gapMs: backoff + int(r, 8, 40) }))
        backoff *= 2
      }
      tail.push(d("error", "camera", "CameraSource failed", { errno: "ENODEV", attempts: 7 }, { traceback: tracebackLobby }))
      tail.push(d("error", null, "stream exited", { code: 1, restarts: 7 }))
      return [{ at: 999, lines: tail }]
    }
    default:
      return []
  }
}

function weighted(r: Rand, ts: Template[]) {
  const total = ts.reduce((a, t) => a + t.w, 0)
  let x = r() * total
  for (const t of ts) if ((x -= t.w) <= 0) return t
  return ts[ts.length - 1]
}

const cache = new Map<string, LogLine[]>()

/** About 120 lines ending at the stream's last activity. */
export function streamLogs(stream: StreamSpec, count = 120): LogLine[] {
  const hit = cache.get(stream.id)
  if (hit) return hit
  const r = rand(hash(stream.id))
  const c: Counters = {}
  const tpl = steady[stream.id] ?? []
  const script = scripted(stream, r)
  const tailMock = stream.id === "front-door" ? mockLogs.filter((m) => m.message !== "opened device" && m.message !== "model loaded") : []
  const scriptedCount = script.reduce((a, s) => a + s.lines.length, 0)
  const steadyCount = Math.max(0, count - scriptedCount - tailMock.length)
  const drafts: Draft[] = []
  for (let i = 0; i <= steadyCount; i++) {
    for (const s of script) if (s.at === i || (s.at === 999 && i === steadyCount)) drafts.push(...s.lines)
    if (i < steadyCount && tpl.length) drafts.push(weighted(r, tpl).make(r, c))
  }
  const end = Date.parse(endTimes[stream.id] ?? "2026-10-20T21:14:00.000Z")
  const gaps = drafts.map((x) => x.gapMs ?? Math.round(40 + -Math.log(1 - r()) * 520))
  let t = end - gaps.reduce((a, g) => a + g, 0)
  const lines: LogLine[] = drafts.map((x, i) => {
    t += gaps[i]
    return {
      id: `${stream.id}:${i}`,
      ts: new Date(t).toISOString(),
      level: x.level,
      stream: stream.id,
      node: x.node,
      pid: x.pid ?? nodePid(stream, x.node),
      msg: x.msg,
      fields: x.fields ?? {},
      traceback: x.traceback,
    }
  })
  tailMock.forEach((m, i) =>
    lines.push({
      id: `${stream.id}:m${i}`,
      ts: `2026-10-20T${m.t}Z`,
      level: m.level,
      stream: stream.id,
      node: m.node,
      pid: nodePid(stream, m.node),
      msg: m.message,
      fields: m.fields ?? {},
    }),
  )
  cache.set(stream.id, lines)
  return lines
}

/** A fresh line for a live tail, after `prev`. */
export function nextLine(stream: StreamSpec, prev: string, seq: number): LogLine {
  const r = rand(hash(stream.id) + seq * 7919)
  const tpl = steady[stream.id] ?? []
  const x = tpl.length ? weighted(r, tpl).make(r, {}) : d("info", null, "tick")
  return {
    id: `${stream.id}:live${seq}`,
    ts: new Date(Date.parse(prev) + 120 + Math.round(r() * 900)).toISOString(),
    level: x.level,
    stream: stream.id,
    node: x.node,
    pid: nodePid(stream, x.node),
    msg: x.msg,
    fields: x.fields ?? {},
  }
}

const machineLines: Record<string, Draft[]> = {
  "studio-mac": [
    d("info", null, "tatolabd started", { version: "0.46.0", pid: 1207 }),
    d("info", null, "relay listening", { relay: "local", addr: "moq://localhost:4443" }),
    d("info", null, "relay joined", { relay: "cloudflare", region: "IAD" }),
    d("info", null, "tailnet peer seen", { peer: "garage-jetson", rtt_ms: 4 }),
    d("info", null, "tailnet peer seen", { peer: "dock-box", rtt_ms: 11 }),
    d("info", null, "dev session attached", { stream: "halftone-booth", terminal: "ttys004" }),
    d("warn", null, "tailnet peer unreachable", { peer: "render-pod", last_seen: "18h" }),
    d("info", null, "control socket client", { client: "Tatolab.app", pid: 2290 }),
  ],
}

/** Every stream on a machine plus the runtime's own lines, in time order. */
export function machineLogs(machineId: string): LogLine[] {
  const key = `machine:${machineId}`
  const hit = cache.get(key)
  if (hit) return hit
  const own = streams.filter((s) => s.machine === machineId).flatMap((s) => streamLogs(s))
  const r = rand(hash(machineId))
  const pid = runtimePid[machineId] ?? 1
  const extra = machineLines[machineId] ?? [
    d("info", null, "tatolabd started", { version: machineById(machineId)?.runtimeVersion ?? "0.46.0", pid }),
    d("info", null, "relay listening", { relay: "local", addr: "moq://localhost:4443" }),
  ]
  const latest = own.length ? Math.max(...own.map((l) => Date.parse(l.ts))) : Date.parse("2026-10-20T21:14:00Z")
  const span = 1000 * 60 * 6
  const rt: LogLine[] = extra.map((x, i) => ({
    id: `${key}:${i}`,
    ts: new Date(latest - span + ((i + 0.5) / extra.length) * span + Math.round(r() * 4000)).toISOString(),
    level: x.level,
    stream: null,
    node: null,
    pid,
    msg: x.msg,
    fields: x.fields ?? {},
  }))
  const all = [...own, ...rt].sort((a, b) => a.ts.localeCompare(b.ts))
  cache.set(key, all)
  return all
}

export function formatClock(ts: string) {
  return ts.slice(11, 23)
}

export function toRecord(l: LogLine) {
  const rec: Record<string, unknown> = { ts: l.ts, level: l.level, stream: l.stream, node: l.node, pid: l.pid, msg: l.msg, fields: l.fields }
  if (l.traceback) rec.traceback = l.traceback
  return rec
}

export function toJsonl(lines: LogLine[]) {
  return lines.map((l) => JSON.stringify(toRecord(l))).join("\n")
}
