import { expect, test } from "vitest";
import { contractVersionOfTheContract, planTatolabAppRelease, planTheContractVersion } from "../plan_tatolab_app_release.mjs";

const PINNED_STREAMLIB_COMMIT = "836cc5b609ee0293878369e7ea6cc12e04bc0f8f";

test("a pin whose contract version differs from the release's skips both builds, with a warning naming both versions", () => {
  const contractVersionPlan = planTheContractVersion({
    pinnedStreamlibCommit: PINNED_STREAMLIB_COMMIT,
    pinnedContractVersion: 3,
    streamlibTag: "v0.70.0",
    releaseContractVersion: 4,
  });
  expect(contractVersionPlan.releaseServesThePinnedContractVersion).toBe(false);
  expect(contractVersionPlan.warning).toContain("streamlib v0.70.0 serves control contract version 4");
  expect(contractVersionPlan.warning).toContain(`streamlib ${PINNED_STREAMLIB_COMMIT}, which serves version 3`);
});

test("a pin with the release's contract version plans as before", () => {
  expect(
    planTheContractVersion({
      pinnedStreamlibCommit: PINNED_STREAMLIB_COMMIT,
      pinnedContractVersion: 3,
      streamlibTag: "v0.69.87",
      releaseContractVersion: 3,
    }),
  ).toEqual({ releaseServesThePinnedContractVersion: true, warning: null });
  expect(planTatolabAppRelease({ streamlibVersion: "0.69.87", publishedAppVersion: "0.69.87" })).toEqual({ appVersion: "0.69.88" });
});

test("a contract's version is read from x-contract-version under info, and one naming none is refused", () => {
  expect(contractVersionOfTheContract({ openrpc: "1.3.2", info: { version: "3", "x-contract-version": 3 } }, "contract.json")).toBe(3);
  expect(() => contractVersionOfTheContract({ info: { version: "3" } }, "streamlib v0.1.0 contract.json")).toThrow(
    "streamlib v0.1.0 contract.json names no x-contract-version under info",
  );
});
