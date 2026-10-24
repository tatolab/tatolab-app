// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The window's look as the person chose it: Light, Dark, or the system's. The choice is kept under
// one storage key, which the page's first script reads before first paint (`index.html`); a
// System choice follows the OS live while the window is open.

/** What the person chose for the window's look. */
export type WindowAppearance = "light" | "dark" | "system";

/** The theme the window shows. */
export type WindowTheme = "light" | "dark";

/** Where the choice is kept; `index.html`'s first script reads the same key. */
export const CHOSEN_WINDOW_APPEARANCE_STORAGE_KEY = "tatolab-window-theme";

/** The media query the OS's dark appearance answers. */
export const SYSTEM_PREFERS_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** The choice a stored value names; Light, the default, for nothing stored or a value this window does not know. */
export function windowAppearanceStored(storedValue: string | null): WindowAppearance {
  return storedValue === "dark" || storedValue === "system" ? storedValue : "light";
}

/** The theme `appearance` shows while the OS does or does not prefer dark. */
export function windowThemeShownFor(appearance: WindowAppearance, systemPrefersDark: boolean): WindowTheme {
  if (appearance === "system") return systemPrefersDark ? "dark" : "light";
  return appearance;
}

/** The storage the choice is kept in; a page that cannot keep it still shows it until the window reloads. */
export interface WindowAppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The OS's dark preference as a media query reports it, and its changes. */
export interface SystemDarkPreference {
  readonly matches: boolean;
  addEventListener(eventType: "change", listener: () => void): void;
}

/** The person's choice of look, applied to the page as its `dark` class, which every listener re-reads on each change. */
export class WindowAppearanceChoice {
  private chosenAppearance: WindowAppearance;
  private shownTheme: WindowTheme;
  private readonly appearanceListeners = new Set<() => void>();

  /** The choice kept in `storage`, the theme the page already shows by its `dark` class, and the OS's preference, which a System choice follows. */
  constructor(
    private readonly storage: WindowAppearanceStorage | null,
    private readonly systemDarkPreference: SystemDarkPreference,
    private readonly documentElement: HTMLElement,
  ) {
    this.chosenAppearance = windowAppearanceStored(readStoredValue(storage));
    this.shownTheme = documentElement.classList.contains("dark") ? "dark" : "light";
    systemDarkPreference.addEventListener("change", () => {
      if (this.chosenAppearance === "system") this.showTheme(windowThemeShownFor("system", this.systemDarkPreference.matches));
    });
  }

  readonly readChosenAppearance = (): WindowAppearance => this.chosenAppearance;

  readonly readShownTheme = (): WindowTheme => this.shownTheme;

  readonly subscribeToAppearance = (appearanceListener: () => void): (() => void) => {
    this.appearanceListeners.add(appearanceListener);
    return () => this.appearanceListeners.delete(appearanceListener);
  };

  /** Show `appearance` now and keep it for the next time the window opens. */
  choose(appearance: WindowAppearance): void {
    this.chosenAppearance = appearance;
    try {
      this.storage?.setItem(CHOSEN_WINDOW_APPEARANCE_STORAGE_KEY, appearance);
    } catch {
      // A page that cannot keep the choice still shows it until the window reloads.
    }
    this.showTheme(windowThemeShownFor(appearance, this.systemDarkPreference.matches));
  }

  private showTheme(theme: WindowTheme): void {
    this.shownTheme = theme;
    this.documentElement.classList.toggle("dark", theme === "dark");
    for (const appearanceListener of this.appearanceListeners) appearanceListener();
  }
}

function readStoredValue(storage: WindowAppearanceStorage | null): string | null {
  try {
    return storage?.getItem(CHOSEN_WINDOW_APPEARANCE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
