// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { cn } from "@/lib/utils"

/** The tatolab.com mark: an outlined rounded square with a blue T. */
export function TatolabMark({ className, filled = false }: { className?: string; filled?: boolean }) {
  if (filled) {
    return (
      <svg viewBox="0 0 64 64" className={cn("size-5", className)} aria-hidden>
        <rect width="64" height="64" rx="16" fill="#2a5bff" />
        <path d="M19 22h26M32 22v23" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 22 22" className={cn("size-[18px]", className)} aria-hidden>
      <rect x="1" y="1" width="20" height="20" rx="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 8h8M11 8v7" stroke="#2a5bff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Tato, the lab potato. The 3D render scales smoothly to any size. The pixel sprite is
 * 160px native and is only ever drawn at 160 or an integer multiple — never shrunk.
 */
export function Mascot({
  variant = "3d",
  className,
  scale = 1,
}: {
  variant?: "3d" | "pixel"
  className?: string
  scale?: 1 | 2
}) {
  if (variant === "pixel") {
    return (
      <img
        src="/brand/tato-pixel.png"
        alt="Tato"
        width={160 * scale}
        height={160 * scale}
        draggable={false}
        className={cn("shrink-0 select-none [image-rendering:pixelated]", className)}
        style={{ width: 160 * scale, height: 160 * scale }}
      />
    )
  }
  return <img src="/brand/tato-3d.png" alt="Tato" draggable={false} className={cn("select-none object-contain", className)} />
}
