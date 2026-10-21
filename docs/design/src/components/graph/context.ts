// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createContext, useContext } from "react"
import type { LinkSpec, MachineSpec, NodeSpec, PortSpec, StreamSpec } from "@/data/mock"

export interface GraphUi {
  stream: StreamSpec
  machine: MachineSpec
  stopped: boolean
  showPreviews: boolean
  showMetrics: boolean
  hoveredEdgeId: string | null
  selectedNodeId: string | null
  pinned: string[]
  openPeek: (nodeId: string, port: string, anchor: HTMLElement) => void
  closePeek: () => void
  togglePin: (key: string) => void
  restartNode: (nodeId: string) => void
  /** Replaces a step's footer. */
  renderFooter?: (spec: NodeSpec) => React.ReactNode
  /** Replaces the rate word under a port preview. */
  portStatus?: (spec: NodeSpec, port: PortSpec) => string
  /** Replaces the rate word on a hovered link. */
  linkStatus?: (link: LinkSpec) => string
}

export const GraphUiContext = createContext<GraphUi | null>(null)

export function useGraphUi() {
  const ui = useContext(GraphUiContext)
  if (!ui) throw new Error("useGraphUi outside GraphUiContext")
  return ui
}

export const pinKey = (nodeId: string, port: string) => `${nodeId}.${port}`
export const address = (ui: Pick<GraphUi, "machine" | "stream">, nodeId: string, port: string) =>
  `${ui.machine.name}/${ui.stream.id}/${nodeId}/${port}`
