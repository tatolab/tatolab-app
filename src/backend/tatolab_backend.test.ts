// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { tatolabWindowHost } from "./tatolab_backend";
import type { TatolabElectronBridge } from "./tatolab_electron_bridge_contract";

const UNANSWERING_TATOLAB_ELECTRON_BRIDGE: TatolabElectronBridge = {
  invokeTatolabCommand: async () => ({ ok: false, refusal: "not under test" }),
  onTatolabStatusChanged: () => () => undefined,
  onStreamPageRequested: () => () => undefined,
};

afterEach(() => {
  window.tatolabElectronBridge = undefined;
  vi.unstubAllGlobals();
});

describe("tatolabWindowHost", () => {
  it("is Electron, with its bridge, where the preload exposed one", () => {
    window.tatolabElectronBridge = UNANSWERING_TATOLAB_ELECTRON_BRIDGE;
    expect(tatolabWindowHost()).toEqual({ kind: "electron", tatolabElectronBridge: UNANSWERING_TATOLAB_ELECTRON_BRIDGE });
  });

  it("is the app's window without its bridge on the app's own scheme with no preload, never the mock", () => {
    vi.stubGlobal("location", new URL("tatolab-app://app/index.html"));
    expect(tatolabWindowHost()).toEqual({ kind: "electron_without_its_bridge" });
  });

  it("is a browser anywhere else", () => {
    expect(tatolabWindowHost()).toEqual({ kind: "browser" });
  });
});
