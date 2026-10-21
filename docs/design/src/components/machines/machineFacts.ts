// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { type MachineSpec, streams } from "@/data/mock"

export const latestRuntimeVersion = "0.46.0"

export const machineFacts: Record<string, { uptime: string; memoryTotalGb: number; lastSeen?: string; seed: number }> = {
  "studio-mac": { uptime: "3d 2h", memoryTotalGb: 36, seed: 3 },
  "garage-jetson": { uptime: "18d 6h", memoryTotalGb: 64, seed: 11 },
  "dock-box": { uptime: "41d 9h", memoryTotalGb: 64, seed: 19 },
  "lobby-tv": { uptime: "9d 1h", memoryTotalGb: 8, seed: 27 },
  "render-pod": { uptime: "—", memoryTotalGb: 16, lastSeen: "9 hours ago", seed: 35 },
}

export const hasUpdate = (m: MachineSpec) => m.runtimeVersion !== latestRuntimeVersion

export const streamsOn = (machineId: string) => streams.filter((s) => s.machine === machineId)
