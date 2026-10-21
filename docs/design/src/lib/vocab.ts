// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

/* The words and icons a person reads. Status is an icon shape, never a coloured dot;
   only a problem gets colour. The runtime's own term stays in tooltips. */

import {
  AudioLines,
  Binary,
  Box,
  Boxes,
  Braces,
  Brain,
  Camera,
  Cpu,
  Globe,
  Infinity as InfinityIcon,
  Laptop,
  LoaderCircle,
  Lock,
  type LucideIcon,
  MonitorPlay,
  SquareX,
  Play,
  Radio,
  RefreshCw,
  ScanSearch,
  Server,
  Sparkles,
  Speaker,
  TriangleAlert,
  Tv,
  Video,
  Waypoints,
} from "lucide-react"
import type { DataKind, Exposure, MachineKind, NodeCategory, NodeOrigin, RunMode, StreamStatus } from "@/data/mock"

/** Healthy states are words alone; only work in progress and problems carry an icon. */
export const statusWords: Record<StreamStatus, { label: string; icon?: LucideIcon; tone: string; spin?: boolean }> = {
  live: { label: "Running", tone: "text-fg-2" },
  starting: { label: "Starting", icon: LoaderCircle, tone: "text-fg-2", spin: true },
  paused: { label: "Stopped", tone: "text-fg-3" },
  attention: { label: "Degraded", icon: TriangleAlert, tone: "text-warn" },
  failed: { label: "Exited", icon: SquareX, tone: "text-danger" },
}

/** Replaces Kept / Attached: what happens when the machine or the terminal goes away. */
export const runModeWords: Record<RunMode, { label: string; long: string; runtimeTerm: string; icon: LucideIcon }> = {
  "always-on": {
    label: "Always on",
    long: "Starts with the runtime and restarts if it exits. Keeps running when the app and terminal close.",
    runtimeTerm: "kept",
    icon: InfinityIcon,
  },
  "dev-session": {
    label: "Dev session",
    long: "Started by `tatolab dev` in a terminal. Reloads on save; ends with the session.",
    runtimeTerm: "attached",
    icon: RefreshCw,
  },
  manual: {
    label: "Manual",
    long: "Runs only when started.",
    runtimeTerm: "stopped",
    icon: Play,
  },
}

export const exposureWords: Record<Exposure, { label: string; short: string; long: string; icon: LucideIcon }> = {
  internal: { label: "Internal", short: "Internal", long: "Only this stream's own steps can read it.", icon: Lock },
  private: { label: "This machine", short: "Machine", long: "Any stream or app on this machine can read it.", icon: Laptop },
  public: { label: "Public", short: "Public", long: "Other machines on the tailnet, and every relay this machine joins.", icon: Globe },
}

export const kindWords: Record<DataKind, { label: string; icon: LucideIcon }> = {
  video: { label: "Video", icon: Video },
  audio: { label: "Audio", icon: AudioLines },
  encoded: { label: "Encoded", icon: Binary },
  tensor: { label: "Tensor", icon: Boxes },
  data: { label: "Data", icon: Braces },
}

export const categoryWords: Record<NodeCategory, { label: string; icon: LucideIcon }> = {
  source: { label: "Sources", icon: Camera },
  effect: { label: "Effects", icon: Sparkles },
  ai: { label: "Inference", icon: Brain },
  codec: { label: "Codecs", icon: Binary },
  sink: { label: "Outputs", icon: Speaker },
  relay: { label: "Relay", icon: Radio },
  analysis: { label: "Analysis", icon: ScanSearch },
}

export const originWords: Record<NodeOrigin, { label: string; long: string; icon: LucideIcon }> = {
  "built-in": { label: "Built-in", long: "Native, ships inside the runtime.", icon: Box },
  python: { label: "Python", long: "A node in this project. Runs in its own process.", icon: Waypoints },
  pack: { label: "Pack", long: "Installed from a pack into this project.", icon: Boxes },
}

export const machineKindIcon: Record<MachineKind, LucideIcon> = {
  mac: Laptop,
  "linux-box": Server,
  jetson: Cpu,
  "set-top": Tv,
  container: MonitorPlay,
}
