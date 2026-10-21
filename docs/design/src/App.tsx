// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/shell/AppShell"
import { ThemeProvider } from "@/components/shell/theme"
import { TooltipProvider } from "@/components/ui/tooltip"
import { EditionProvider } from "@/edition"
import DesignLanguage from "@/pages/DesignLanguage"
import Home from "@/pages/Home"
import Library from "@/pages/Library"
import Logs from "@/pages/Logs"
import Machines from "@/pages/Machines"
import NewStream from "@/pages/NewStream"
import Settings from "@/pages/Settings"
import Setup from "@/pages/Setup"
import Sharing from "@/pages/Sharing"
import Storyboard from "@/pages/Storyboard"
import StreamInspect from "@/pages/StreamInspect"
import StreamLogs from "@/pages/StreamLogs"
import StreamGraph from "@/pages/StreamGraph"
import StreamLayout from "@/pages/StreamLayout"
import StreamStats from "@/pages/StreamStats"
import StreamSharing from "@/pages/StreamSharing"
import StreamWatch from "@/pages/StreamWatch"
import Tv from "@/pages/Tv"

/** The long-term direction, mounted under /direction. */
export default function DirectionApp() {
  return (
    <EditionProvider edition="direction">
    <ThemeProvider>
      <TooltipProvider delay={200}>
        <BrowserRouter basename="/direction">
          <Routes>
            <Route path="/setup" element={<Setup />} />
            <Route path="/tv" element={<Tv />} />
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route path="/new" element={<NewStream />} />
              <Route path="/streams/:streamId" element={<StreamLayout />}>
                <Route index element={<StreamWatch />} />
                <Route path="graph" element={<StreamGraph />} />
                <Route path="stats" element={<StreamStats />} />
                <Route path="logs" element={<StreamLogs />} />
                <Route path="inspect" element={<StreamInspect />} />
                <Route path="sharing" element={<StreamSharing />} />
              </Route>
              <Route path="/library" element={<Library />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/sharing" element={<Sharing />} />
              <Route path="/machines" element={<Machines />} />
              <Route path="/settings" element={<Settings />} />
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
