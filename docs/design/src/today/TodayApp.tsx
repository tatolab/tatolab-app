// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { BrowserRouter, Route, Routes } from "react-router-dom"
import { ThemeProvider } from "@/components/shell/theme"
import { TooltipProvider } from "@/components/ui/tooltip"
import { EditionProvider } from "@/edition"
import DesignLanguage from "@/pages/DesignLanguage"
import Storyboard from "@/pages/Storyboard"
import TodayNewStream from "./pages/TodayNewStream"
import TodayRelays from "./pages/TodayRelays"
import TodaySettings from "./pages/TodaySettings"
import TodaySetup from "./pages/TodaySetup"
import TodayStreamGraph from "./pages/TodayStreamGraph"
import TodayStreamInspect from "./pages/TodayStreamInspect"
import TodayStreamLayout from "./pages/TodayStreamLayout"
import TodayStreamLogs from "./pages/TodayStreamLogs"
import TodayStreamOutputs from "./pages/TodayStreamOutputs"
import TodayStreamOverview from "./pages/TodayStreamOverview"
import TodayStreams from "./pages/TodayStreams"
import { TodayShell } from "./TodayShell"

/** What the app can be with the runtime as it is today: one machine, streams, graph, logs, outputs, relays. */
export default function TodayApp() {
  return (
    <EditionProvider edition="today">
      <ThemeProvider>
        <TooltipProvider delay={200}>
          <BrowserRouter>
            <Routes>
              <Route path="/setup" element={<TodaySetup />} />
              <Route element={<TodayShell />}>
                <Route index element={<TodayStreams />} />
                <Route path="/new" element={<TodayNewStream />} />
                <Route path="/streams/:streamId" element={<TodayStreamLayout />}>
                  <Route index element={<TodayStreamOverview />} />
                  <Route path="graph" element={<TodayStreamGraph />} />
                  <Route path="logs" element={<TodayStreamLogs />} />
                  <Route path="outputs" element={<TodayStreamOutputs />} />
                  <Route path="inspect" element={<TodayStreamInspect />} />
                </Route>
                <Route path="/relays" element={<TodayRelays />} />
                <Route path="/settings" element={<TodaySettings />} />
                <Route path="/storyboard" element={<Storyboard />} />
                <Route path="/design" element={<DesignLanguage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </EditionProvider>
  )
}
