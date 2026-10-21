// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { createContext, useContext, useEffect, useState } from "react"

type Theme = "light" | "dark"
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "light",
  setTheme: () => {},
})

function initialTheme(): Theme {
  const fromUrl = new URLSearchParams(window.location.search).get("theme")
  if (fromUrl === "light" || fromUrl === "dark") return fromUrl
  const stored = localStorage.getItem("tatolab-theme")
  return stored === "dark" ? "dark" : "light"
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    localStorage.setItem("tatolab-theme", theme)
  }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
