// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import DirectionApp from "./App.tsx"
import TodayApp from "./today/TodayApp.tsx"

const direction = window.location.pathname === "/direction" || window.location.pathname.startsWith("/direction/")

createRoot(document.getElementById("root")!).render(<StrictMode>{direction ? <DirectionApp /> : <TodayApp />}</StrictMode>)
