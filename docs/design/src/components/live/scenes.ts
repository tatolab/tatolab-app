// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/* Stand-ins for live frames: photographs (public/media, see CREDITS.md) with a slow
   camera drift, plus the processing a step would apply. Nothing here is real video. */

import type { Scene } from "@/data/mock"

export type SceneState = Record<string, unknown>
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, state: SceneState) => void

const media = ["street", "walkway", "aerial", "portrait", "lake", "valley", "laptop", "fjord"] as const
type Media = (typeof media)[number]
const images = new Map<Media, HTMLImageElement>()
for (const name of media) {
  const img = new Image()
  img.decoding = "async"
  img.src = `/media/${name}.jpg`
  images.set(name, img)
}

let lastTransform: { dx: number; dy: number; dw: number; dh: number } | null = null

function photo(ctx: CanvasRenderingContext2D, name: Media, w: number, h: number, t: number, drift = 1) {
  const img = images.get(name)!
  ctx.fillStyle = "#0b0b0c"
  ctx.fillRect(0, 0, w, h)
  if (!img.complete || !img.naturalWidth) return false
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * (1.06 + Math.sin(t / 9) * 0.02 * drift)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const dx = (w - dw) / 2 + Math.sin(t / 13) * w * 0.012 * drift
  const dy = (h - dh) / 2 + Math.cos(t / 11) * h * 0.01 * drift
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, dx, dy, dw, dh)
  lastTransform = { dx, dy, dw, dh }
  return true
}

/** Boxes in the photo's own 0–1 coordinates, carried along with the drift. */
const streetDetections = [
  { x: 0.102, y: 0.437, w: 0.09, h: 0.396, label: "person 0.94" },
  { x: 0.414, y: 0.368, w: 0.129, h: 0.382, label: "tram 0.97" },
  { x: 0.746, y: 0.581, w: 0.039, h: 0.18, label: "person 0.88" },
  { x: 0.812, y: 0.583, w: 0.042, h: 0.188, label: "person 0.91" },
  { x: 0.859, y: 0.594, w: 0.033, h: 0.172, label: "person 0.83" },
  { x: 0.952, y: 0.546, w: 0.046, h: 0.243, label: "person 0.90" },
  { x: 0.207, y: 0.569, w: 0.082, h: 0.164, label: "person 0.86" },
]

function detections(ctx: CanvasRenderingContext2D, h: number, t: number) {
  const tf = lastTransform
  if (!tf) return
  const fsz = Math.max(8, Math.round(h * 0.03))
  ctx.font = `500 ${fsz}px "Geist Mono Variable", ui-monospace, monospace`
  ctx.lineWidth = Math.max(1, Math.round(h / 360))
  streetDetections.forEach((d, i) => {
    const jitter = Math.sin(t * 2 + i) * 0.002
    const x = Math.round(tf.dx + (d.x + jitter) * tf.dw)
    const y = Math.round(tf.dy + d.y * tf.dh)
    const bw = Math.round(d.w * tf.dw)
    const bh = Math.round(d.h * tf.dh)
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.strokeRect(x + 0.5, y + 0.5, bw, bh)
    if (bh < tf.dh * 0.3) return
    const tw = ctx.measureText(d.label).width
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.fillRect(x, Math.round(y - fsz * 1.4), Math.round(tw + fsz * 0.8), Math.round(fsz * 1.4))
    ctx.fillStyle = "#0b0b0c"
    ctx.fillText(d.label, Math.round(x + fsz * 0.4), Math.round(y - fsz * 0.38))
  })
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.7) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7)
  g.addColorStop(0, "rgba(0,0,0,0)")
  g.addColorStop(1, `rgba(0,0,0,${strength})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

const scratch = document.createElement("canvas")
function sample(name: Media, cols: number, rows: number, t: number) {
  if (scratch.width !== cols || scratch.height !== rows) {
    scratch.width = cols
    scratch.height = rows
  }
  const sc = scratch.getContext("2d", { willReadFrequently: true })!
  photo(sc, name, cols, rows, t)
  return sc.getImageData(0, 0, cols, rows).data
}

function halftone(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const cols = 96
  const rows = Math.round((cols * h) / w)
  const data = sample("portrait", cols, rows, t)
  ctx.fillStyle = "#f2f0eb"
  ctx.fillRect(0, 0, w, h)
  const cw = w / cols
  const ch = h / rows
  ctx.fillStyle = "#151517"
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
      const r = (1 - lum) * Math.min(cw, ch) * 0.58
      if (r < 0.25) continue
      ctx.beginPath()
      ctx.arc(x * cw + cw / 2 + (y % 2 ? cw / 2 : 0), y * ch + ch / 2, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function depth(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const cols = 160
  const rows = Math.round((cols * h) / w)
  const data = sample("lake", cols, rows, t)
  const sc = scratch.getContext("2d")!
  const img = sc.createImageData(cols, rows)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
      const near = Math.min(1, Math.max(0, (y / rows) ** 1.6 * 0.85 + (1 - lum) * 0.2))
      const v = Math.round(18 + near * 225)
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  }
  sc.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(scratch, 0, 0, w, h)
}

const SMPTE = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"]
function pattern(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const bw = w / SMPTE.length
  SMPTE.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(Math.floor(i * bw), 0, Math.ceil(bw) + 1, Math.ceil(h * 0.67))
  })
  const mid = ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"]
  mid.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(Math.floor(i * bw), Math.floor(h * 0.67), Math.ceil(bw) + 1, Math.ceil(h * 0.08))
  })
  const low = ["#00214c", "#ffffff", "#32006a", "#131313", "#090909", "#131313", "#1d1d1d"]
  low.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(Math.floor(i * bw), Math.floor(h * 0.75), Math.ceil(bw) + 1, Math.ceil(h * 0.25))
  })
  const frames = Math.floor(t * 30)
  const tc = `${String(Math.floor(t / 3600) % 24).padStart(2, "0")}:${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(Math.floor(t) % 60).padStart(2, "0")}:${String(frames % 30).padStart(2, "0")}`
  const fsz = Math.max(9, Math.round(h * 0.06))
  ctx.font = `500 ${fsz}px "Geist Mono Variable", ui-monospace, monospace`
  const tw = ctx.measureText(tc).width
  ctx.fillStyle = "rgba(0,0,0,0.8)"
  ctx.fillRect(Math.round(w / 2 - tw / 2 - fsz * 0.5), Math.round(h * 0.42 - fsz), Math.round(tw + fsz), Math.round(fsz * 1.5))
  ctx.fillStyle = "#fff"
  ctx.fillText(tc, Math.round(w / 2 - tw / 2), Math.round(h * 0.42 + fsz * 0.2))
}

function waveform(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.fillStyle = "#0b0b0c"
  ctx.fillRect(0, 0, w, h)
  const bars = Math.max(32, Math.floor(w / 5))
  const bw = w / bars
  ctx.fillStyle = "#d4d4d8"
  for (let i = 0; i < bars; i++) {
    const u = i / bars
    const env = Math.abs(Math.sin(t * 1.3 + u * 7)) * 0.6 + Math.abs(Math.sin(t * 3.1 + u * 23)) * 0.3
    const speech = Math.max(0, Math.sin(t * 0.9 + u * 3)) * 0.8 + 0.08
    const amp = Math.max(1, env * speech * h * 0.38)
    ctx.fillRect(Math.round(i * bw + bw * 0.25), Math.round(h / 2 - amp), Math.max(1, Math.round(bw * 0.5)), Math.round(amp * 2))
  }
}

function ramp(v: number) {
  const x = Math.max(0, Math.min(1, v))
  const c = Math.round(12 + x * 236)
  return `rgb(${c},${c},${Math.min(255, c + 6)})`
}

function spectrumColumn(ctx: CanvasRenderingContext2D, x: number, col: number, h: number, t: number) {
  const bins = 64
  const bh = h / bins
  for (let b = 0; b < bins; b++) {
    const f = 1 - b / bins
    const formant = Math.exp(-((f - 0.2 - Math.sin(t * 2) * 0.04) ** 2) / 0.003) + Math.exp(-((f - 0.45) ** 2) / 0.008) * 0.55
    const voiced = Math.max(0, Math.sin(t * 0.9)) * 0.9 + 0.1
    const v = (formant * voiced + Math.random() * 0.08) * (1 - f * 0.5)
    ctx.fillStyle = ramp(v)
    ctx.fillRect(x, Math.floor(b * bh), col, Math.ceil(bh) + 1)
  }
}

function spectrum(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, s: SceneState) {
  const col = Math.max(2, Math.round(w / 120))
  if (s.last === undefined || s.w !== w || s.h !== h) {
    const columns = Math.ceil(w / col)
    for (let i = 0; i < columns; i++) spectrumColumn(ctx, i * col, col, h, t - (columns - i) / 30)
    s.w = w
    s.h = h
  }
  s.last = t
  const img = ctx.getImageData(col, 0, w - col, h)
  ctx.putImageData(img, 0, 0)
  spectrumColumn(ctx, w - col, col, h, t)
}

function heat(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  photo(ctx, "walkway", w, h, t, 0.4)
  ctx.fillStyle = "rgba(0,0,0,0.35)"
  ctx.fillRect(0, 0, w, h)
  const blobs = [
    { x: 0.6, y: 0.3, r: 0.12 },
    { x: 0.66, y: 0.5, r: 0.16 },
    { x: 0.72, y: 0.72, r: 0.2 },
    { x: 0.45, y: 0.25, r: 0.08 },
  ]
  ctx.globalCompositeOperation = "screen"
  blobs.forEach((b, i) => {
    const cx = (b.x + Math.sin(t * 0.6 + i) * 0.01) * w
    const cy = (b.y + ((t * 0.02 + i * 0.1) % 0.08)) * h
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r * w)
    g.addColorStop(0, "rgba(255,170,60,0.7)")
    g.addColorStop(0.45, "rgba(220,60,60,0.32)")
    g.addColorStop(1, "rgba(60,40,160,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  ctx.globalCompositeOperation = "source-over"
}

function hud(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = "rgba(255,255,255,0.8)"
  ctx.lineWidth = 1
  const cx = Math.round(w / 2) + 0.5
  const cy = Math.round(h / 2) + 0.5
  const r = Math.round(h * 0.06)
  ctx.beginPath()
  ctx.moveTo(cx - r * 2, cy)
  ctx.lineTo(cx - r * 0.6, cy)
  ctx.moveTo(cx + r * 0.6, cy)
  ctx.lineTo(cx + r * 2, cy)
  ctx.moveTo(cx, cy - r * 2)
  ctx.lineTo(cx, cy - r * 0.6)
  ctx.moveTo(cx, cy + r * 0.6)
  ctx.lineTo(cx, cy + r * 2)
  ctx.stroke()
}

function encoded(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const cols = 48
  const rows = Math.round((cols * h) / w)
  sample("street", cols, rows, t)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(scratch, 0, 0, w, h)
  ctx.imageSmoothingEnabled = true
}

function noSignal(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#0b0b0c"
  ctx.fillRect(0, 0, w, h)
  const fsz = Math.max(9, Math.round(h * 0.05))
  ctx.font = `500 ${fsz}px "Geist Variable", system-ui, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,0.35)"
  const text = "No signal"
  const tw = ctx.measureText(text).width
  ctx.fillText(text, Math.round(w / 2 - tw / 2), Math.round(h / 2 + fsz / 3))
}

function mosaic(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, s: SceneState) {
  ctx.fillStyle = "#0b0b0c"
  ctx.fillRect(0, 0, w, h)
  const gap = Math.max(2, Math.round(w * 0.006))
  const tw = Math.floor((w - gap) / 2)
  const th = Math.floor((h - gap) / 2)
  const tiles: Draw[] = [sceneDraw.detect, sceneDraw.thermal, sceneDraw.drone, sceneDraw.vignette]
  tiles.forEach((draw, i) => {
    const x = (i % 2) * (tw + gap)
    const y = Math.floor(i / 2) * (th + gap)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, tw, th)
    ctx.clip()
    ctx.translate(x, y)
    draw(ctx, tw, th, t + i * 3, s)
    ctx.restore()
  })
}

export const sceneDraw: Record<Scene, Draw> = {
  camera: (c, w, h, t) => void photo(c, "street", w, h, t),
  detect: (c, w, h, t) => {
    if (photo(c, "street", w, h, t)) detections(c, h, t)
  },
  halftone,
  pattern,
  inverted: (c, w, h, t) => {
    pattern(c, w, h, t)
    c.globalCompositeOperation = "difference"
    c.fillStyle = "#fff"
    c.fillRect(0, 0, w, h)
    c.globalCompositeOperation = "source-over"
  },
  vignette: (c, w, h, t) => {
    photo(c, "valley", w, h, t)
    vignette(c, w, h)
  },
  waveform,
  spectrum,
  thermal: heat,
  depth,
  screen: (c, w, h, t) => void photo(c, "laptop", w, h, t, 0.3),
  drone: (c, w, h, t) => {
    photo(c, "aerial", w, h, t, 1.6)
    hud(c, w, h)
  },
  warehouse: (c, w, h, t) => void photo(c, "walkway", w, h, t, 0.4),
  encoded,
  "no-signal": (c, w, h) => noSignal(c, w, h),
  mosaic,
}
