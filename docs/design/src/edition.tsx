// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createContext, useContext } from "react"

/** Which prototype is showing: what the runtime supports today, or the long-term direction. */
export type Edition = "today" | "direction"

const EditionContext = createContext<Edition>("today")

export function EditionProvider({ edition, children }: { edition: Edition; children: React.ReactNode }) {
  return <EditionContext.Provider value={edition}>{children}</EditionContext.Provider>
}

export const useEdition = () => useContext(EditionContext)

/** The other edition's home, for a full-page switch between the two routers. */
export const editionHome: Record<Edition, string> = { today: "/", direction: "/direction" }
