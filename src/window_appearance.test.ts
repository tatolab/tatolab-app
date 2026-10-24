// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { WindowAppearanceChoice, windowAppearanceStored, windowThemeShownFor, type SystemDarkPreference } from "./window_appearance";

/** An OS whose dark preference the test flips, telling each listener as a media query would. */
function systemDarkPreferenceThatFlips(prefersDarkAtFirst: boolean) {
  const changeListeners: (() => void)[] = [];
  const systemDarkPreference: SystemDarkPreference & { matches: boolean } = {
    matches: prefersDarkAtFirst,
    addEventListener: (_eventType, listener) => changeListeners.push(listener),
  };
  const flipTo = (prefersDark: boolean) => {
    systemDarkPreference.matches = prefersDark;
    changeListeners.forEach((changeListener) => changeListener());
  };
  return { systemDarkPreference, flipTo };
}

function storageHolding(storedValue: string | null) {
  const kept = new Map<string, string>(storedValue === null ? [] : [["tatolab-window-theme", storedValue]]);
  return { kept, storage: { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value) } };
}

describe("the window's appearance", () => {
  it("reads Light for nothing stored or a value it does not know, and System follows the OS", () => {
    expect(windowAppearanceStored(null)).toBe("light");
    expect(windowAppearanceStored("sepia")).toBe("light");
    expect(windowAppearanceStored("system")).toBe("system");
    expect(windowThemeShownFor("system", true)).toBe("dark");
    expect(windowThemeShownFor("system", false)).toBe("light");
    expect(windowThemeShownFor("dark", false)).toBe("dark");
  });

  it("shows a choice at once, keeps it, and tells every listener", () => {
    const documentElement = document.createElement("html");
    const { kept, storage } = storageHolding(null);
    const appearance = new WindowAppearanceChoice(storage, systemDarkPreferenceThatFlips(false).systemDarkPreference, documentElement);
    let changesHeard = 0;
    appearance.subscribeToAppearance(() => (changesHeard += 1));

    appearance.choose("dark");

    expect(documentElement.classList.contains("dark")).toBe(true);
    expect(appearance.readChosenAppearance()).toBe("dark");
    expect(appearance.readShownTheme()).toBe("dark");
    expect(kept.get("tatolab-window-theme")).toBe("dark");
    expect(changesHeard).toBe(1);
  });

  it("follows the OS live while System is chosen, and stops once Light or Dark is", () => {
    const documentElement = document.createElement("html");
    const { systemDarkPreference, flipTo } = systemDarkPreferenceThatFlips(false);
    const appearance = new WindowAppearanceChoice(storageHolding("system").storage, systemDarkPreference, documentElement);
    expect(appearance.readChosenAppearance()).toBe("system");

    flipTo(true);
    expect(documentElement.classList.contains("dark")).toBe(true);
    flipTo(false);
    expect(documentElement.classList.contains("dark")).toBe(false);

    appearance.choose("dark");
    flipTo(false);
    expect(documentElement.classList.contains("dark")).toBe(true);
  });

  it("starts from the theme the page's first script already showed, so a ?theme= preset holds", () => {
    const documentElement = document.createElement("html");
    documentElement.classList.add("dark");
    const appearance = new WindowAppearanceChoice(storageHolding(null).storage, systemDarkPreferenceThatFlips(false).systemDarkPreference, documentElement);

    expect(appearance.readShownTheme()).toBe("dark");
    expect(documentElement.classList.contains("dark")).toBe(true);
  });

  it("still shows a choice a page cannot keep", () => {
    const documentElement = document.createElement("html");
    const refusingStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const appearance = new WindowAppearanceChoice(refusingStorage, systemDarkPreferenceThatFlips(false).systemDarkPreference, documentElement);

    appearance.choose("dark");

    expect(documentElement.classList.contains("dark")).toBe(true);
  });
});
