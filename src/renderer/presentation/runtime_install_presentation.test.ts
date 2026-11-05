import { describe, expect, it } from "vitest";
import { presentRuntimeBuild, presentRuntimeInstallOverlay } from "./runtime_install_presentation";

const CARRIED_RUNTIME_BUILD = `0.68.0-1a2b3c4${"d".repeat(33)}`;

describe("presentRuntimeBuild", () => {
  it("shows a build as its version and its commit abbreviated, and a name of another shape as it is", () => {
    expect(presentRuntimeBuild(CARRIED_RUNTIME_BUILD)).toBe("0.68.0 (1a2b3c4)");
    expect(presentRuntimeBuild(`0.68.0-rc.1-${"0".repeat(40)}`)).toBe("0.68.0-rc.1 (0000000)");
    expect(presentRuntimeBuild("0.68.0-unknown")).toBe("0.68.0-unknown");
  });
});

describe("presentRuntimeInstallOverlay", () => {
  it("shows nothing while no install is under way", () => {
    expect(presentRuntimeInstallOverlay({ kind: "none" })).toBeNull();
  });

  it("names the build being installed, says streams come back, and shows the installer's lines as they come", () => {
    expect(
      presentRuntimeInstallOverlay({ kind: "installing", carried_runtime_build: CARRIED_RUNTIME_BUILD, installer_lines: ["Stopping the runtime"] }),
    ).toEqual({
      stage: "installing",
      heading: "Updating the runtime",
      explanation: "This copy of Spudnik Studio carries runtime 0.68.0 (1a2b3c4). Your streams stop for a moment and come back on it.",
      installerLines: ["Stopping the runtime"],
      refusal: null,
    });
  });

  it("keeps a refusal in the installer's own words beside its lines, and says when the carried runtime could not be read", () => {
    const refusal = "tatolab install: Tatolab 0.68.0 did not start; Tatolab 0.67.0 is running again";
    expect(
      presentRuntimeInstallOverlay({ kind: "failed", carried_runtime_build: CARRIED_RUNTIME_BUILD, installer_lines: ["Starting Tatolab"], refusal }),
    ).toEqual({
      stage: "failed",
      heading: "The runtime didn't update",
      explanation: "Runtime 0.68.0 (1a2b3c4) wasn't installed. The installer says why below.",
      installerLines: ["Starting Tatolab"],
      refusal,
    });
    expect(
      presentRuntimeInstallOverlay({ kind: "failed", carried_runtime_build: null, installer_lines: [], refusal: "The runtime this app carries could not be read: …" })
        ?.explanation,
    ).toBe("Spudnik Studio couldn't read the runtime this copy carries, so nothing was installed.");
  });
});
