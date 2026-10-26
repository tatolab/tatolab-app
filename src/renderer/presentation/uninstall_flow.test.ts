import { describe, expect, it } from "vitest";
import {
  advanceUninstallFlow,
  canDismissUninstallSheet,
  isUninstallUnderway,
  UNINSTALL_FLOW_AT_REST,
  type UninstallFlowEvent,
  type UninstallFlowState,
} from "./uninstall_flow";

function advanceThrough(events: UninstallFlowEvent[], from: UninstallFlowState = UNINSTALL_FLOW_AT_REST): UninstallFlowState {
  return events.reduce(advanceUninstallFlow, from);
}

const OPENED_ON_MACOS: UninstallFlowEvent = { kind: "sheet_opened", platform: "macos" };
const OPENED_ON_LINUX: UninstallFlowEvent = { kind: "sheet_opened", platform: "linux" };
const DISMISSED: UninstallFlowEvent = { kind: "sheet_dismissed" };
const CONFIRMED: UninstallFlowEvent = { kind: "uninstall_confirmed" };
const FINISHED: UninstallFlowEvent = { kind: "uninstall_finished" };
const REFUSED: UninstallFlowEvent = { kind: "uninstall_refused", reason: "the administrator prompt was cancelled" };

describe("the uninstall flow on macOS", () => {
  it("opens on the confirmation, and Cancel or Esc goes back to Settings with nothing to report", () => {
    expect(advanceThrough([OPENED_ON_MACOS])).toEqual({ phase: "confirming" });
    expect(advanceThrough([OPENED_ON_MACOS, DISMISSED])).toEqual({ phase: "closed", refusalReason: null });
  });

  it("uninstalls once confirmed, and can't be dismissed while it runs or after it finishes", () => {
    const uninstalling = advanceThrough([OPENED_ON_MACOS, CONFIRMED]);
    expect(uninstalling).toEqual({ phase: "uninstalling" });
    expect(canDismissUninstallSheet(uninstalling)).toBe(false);
    expect(advanceUninstallFlow(uninstalling, DISMISSED)).toBe(uninstalling);

    const uninstalled = advanceUninstallFlow(uninstalling, FINISHED);
    expect(uninstalled).toEqual({ phase: "uninstalled" });
    expect(advanceUninstallFlow(uninstalled, DISMISSED)).toBe(uninstalled);
    expect(advanceUninstallFlow(uninstalled, REFUSED)).toBe(uninstalled);
  });

  it("closes on a refusal and leaves its reason for Settings, until the sheet opens again", () => {
    const refused = advanceThrough([OPENED_ON_MACOS, CONFIRMED, REFUSED]);
    expect(refused).toEqual({ phase: "closed", refusalReason: "the administrator prompt was cancelled" });
    expect(advanceThrough([OPENED_ON_MACOS], refused)).toEqual({ phase: "confirming" });
    expect(advanceThrough([OPENED_ON_MACOS, DISMISSED], refused)).toEqual(UNINSTALL_FLOW_AT_REST);
  });

  it("counts an uninstall as underway from the confirmation until the app quits", () => {
    expect(isUninstallUnderway(advanceThrough([OPENED_ON_MACOS]))).toBe(false);
    expect(isUninstallUnderway(advanceThrough([OPENED_ON_MACOS, CONFIRMED]))).toBe(true);
    expect(isUninstallUnderway(advanceThrough([OPENED_ON_MACOS, CONFIRMED, FINISHED]))).toBe(true);
    expect(isUninstallUnderway(advanceThrough([OPENED_ON_MACOS, CONFIRMED, REFUSED]))).toBe(false);
  });
});

describe("the uninstall flow on Linux", () => {
  it("only shows the installer's steps, which Close or Esc dismiss", () => {
    const showingSteps = advanceThrough([OPENED_ON_LINUX]);
    expect(showingSteps).toEqual({ phase: "showing_linux_steps" });
    expect(canDismissUninstallSheet(showingSteps)).toBe(true);
    expect(advanceUninstallFlow(showingSteps, DISMISSED)).toEqual(UNINSTALL_FLOW_AT_REST);
  });

  it("has nothing to confirm, so the steps never start an uninstall", () => {
    const showingSteps = advanceThrough([OPENED_ON_LINUX]);
    expect(advanceUninstallFlow(showingSteps, CONFIRMED)).toBe(showingSteps);
    expect(isUninstallUnderway(showingSteps)).toBe(false);
  });
});

describe("events out of turn", () => {
  it("leave the flow exactly as it was", () => {
    const confirming = advanceThrough([OPENED_ON_MACOS]);
    for (const outOfTurnEvent of [FINISHED, REFUSED, OPENED_ON_MACOS, OPENED_ON_LINUX]) {
      expect(advanceUninstallFlow(confirming, outOfTurnEvent)).toBe(confirming);
    }
    for (const outOfTurnEvent of [CONFIRMED, FINISHED, REFUSED, DISMISSED]) {
      expect(advanceUninstallFlow(UNINSTALL_FLOW_AT_REST, outOfTurnEvent)).toBe(UNINSTALL_FLOW_AT_REST);
    }
    const uninstalling = advanceThrough([OPENED_ON_MACOS, CONFIRMED]);
    expect(advanceUninstallFlow(uninstalling, CONFIRMED)).toBe(uninstalling);
    expect(advanceUninstallFlow(uninstalling, OPENED_ON_MACOS)).toBe(uninstalling);
  });
});
