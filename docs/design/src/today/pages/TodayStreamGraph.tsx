// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ReactFlowProvider } from "@xyflow/react"
import { TodayGraphEditor } from "../components/stream/TodayGraphEditor"
import { useTodayStream } from "./TodayStreamLayout"

export default function TodayStreamGraph() {
  const stream = useTodayStream()
  return (
    <ReactFlowProvider key={stream.id}>
      <TodayGraphEditor key={stream.id} stream={stream} />
    </ReactFlowProvider>
  )
}
