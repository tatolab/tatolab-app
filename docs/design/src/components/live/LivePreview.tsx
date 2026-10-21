// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useEffect, useRef } from "react"
import type { Scene } from "@/data/mock"
import { cn } from "@/lib/utils"
import { type SceneState, sceneDraw } from "./scenes"

type Tick = (t: number) => void
const subscribers = new Set<Tick>()
let rafHandle = 0
const startedAt = performance.now()
let lastFrame = 0

function loop(now: number) {
  rafHandle = requestAnimationFrame(loop)
  if (now - lastFrame < 1000 / 30) return
  lastFrame = now
  const t = (now - startedAt) / 1000 + 4
  for (const s of subscribers) s(t)
}

function subscribe(tick: Tick) {
  subscribers.add(tick)
  if (!rafHandle) rafHandle = requestAnimationFrame(loop)
  return () => {
    subscribers.delete(tick)
    if (!subscribers.size) {
      cancelAnimationFrame(rafHandle)
      rafHandle = 0
    }
  }
}

/** A procedurally drawn stand-in for a live frame. Paused previews hold one frame, desaturated. */
export function LivePreview({
  scene,
  className,
  paused = false,
  seed = 0,
}: {
  scene: Scene
  className?: string
  paused?: boolean
  seed?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { willReadFrequently: scene === "spectrum" })
    if (!ctx) return
    const state: SceneState = {}
    let visible = true
    const draw = sceneDraw[scene]

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        delete state.last
      }
    }
    resize()
    const ro = new ResizeObserver(() => {
      resize()
      if (paused) draw(ctx, canvas.width, canvas.height, 12 + seed, state)
    })
    ro.observe(canvas)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    io.observe(canvas)

    if (paused) {
      draw(ctx, canvas.width, canvas.height, 12 + seed, state)
      let redraws = 0
      const settle = window.setInterval(() => {
        draw(ctx, canvas.width, canvas.height, 12 + seed, state)
        if (++redraws > 10) window.clearInterval(settle)
      }, 150)
      return () => {
        window.clearInterval(settle)
        ro.disconnect()
        io.disconnect()
      }
    }
    const unsubscribe = subscribe((t) => {
      if (!visible) return
      draw(ctx, canvas.width, canvas.height, t + seed, state)
    })
    return () => {
      unsubscribe()
      ro.disconnect()
      io.disconnect()
    }
  }, [scene, paused, seed])

  return (
    <canvas
      ref={canvasRef}
      className={cn("block size-full", paused && "opacity-60 grayscale", className)}
      aria-hidden
    />
  )
}
