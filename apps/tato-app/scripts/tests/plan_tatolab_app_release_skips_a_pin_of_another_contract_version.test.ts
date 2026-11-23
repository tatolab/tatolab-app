import { expect, test } from "vitest";
import { contractVersionOfTheContract, planTheContractVersion } from "../plan_tatolab_app_release.mjs";

const PINNED_STREAMLIB_COMMIT = "836cc5b609ee0293878369e7ea6cc12e04bc0f8f";
const PIN_FILE_TEXT = JSON.stringify({ streamlib_commit: PINNED_STREAMLIB_COMMIT });
const CONTRACT_PATH = "sdk/tatolab-runtime-client/contract.json";
const PINNED_CONTRACT_URL = `https://raw.githubusercontent.com/tatolab/streamlib/${PINNED_STREAMLIB_COMMIT}/${CONTRACT_PATH}`;

function contractAnswering(contractVersion: number) {
  return new Response(JSON.stringify({ openrpc: "1.3.2", info: { version: String(contractVersion), "x-contract-version": contractVersion } }));
}

/** A fetch that answers each URL from `answers`, and records every URL it is asked for. */
function streamlibServing(answers: Record<string, () => Response | Promise<Response>>) {
  const requestedUrls: string[] = [];
  const fetchContract = (url: string) => {
    requestedUrls.push(url);
    const answer = answers[url];
    return Promise.resolve(answer === undefined ? new Response("", { status: 404 }) : answer());
  };
  return { fetchContract, requestedUrls };
}

function releaseContractUrl(streamlibTag: string) {
  return `https://raw.githubusercontent.com/tatolab/streamlib/refs/tags/${streamlibTag}/${CONTRACT_PATH}`;
}

test("a pin whose contract version differs from the release's skips both builds, with a warning naming both versions", async () => {
  const streamlib = streamlibServing({
    [PINNED_CONTRACT_URL]: () => contractAnswering(3),
    [releaseContractUrl("v0.70.0")]: () => contractAnswering(4),
  });
  const contractVersionPlan = await planTheContractVersion({ fetchContract: streamlib.fetchContract, pinFileText: PIN_FILE_TEXT, streamlibTag: "v0.70.0" });
  expect(streamlib.requestedUrls).toEqual([PINNED_CONTRACT_URL, releaseContractUrl("v0.70.0")]);
  expect(contractVersionPlan.outputLines).toEqual([
    `pinned_streamlib_commit=${PINNED_STREAMLIB_COMMIT}`,
    "streamlib_release_serves_the_pinned_contract_version=false",
  ]);
  expect(contractVersionPlan.warning).toContain("streamlib v0.70.0 serves control contract version 4");
  expect(contractVersionPlan.warning).toContain(`streamlib ${PINNED_STREAMLIB_COMMIT}, which serves version 3`);
});

test("a pin with the release's contract version builds, with no warning", async () => {
  const streamlib = streamlibServing({
    [PINNED_CONTRACT_URL]: () => contractAnswering(3),
    [releaseContractUrl("v0.69.87")]: () => contractAnswering(3),
  });
  const contractVersionPlan = await planTheContractVersion({ fetchContract: streamlib.fetchContract, pinFileText: PIN_FILE_TEXT, streamlibTag: "v0.69.87" });
  expect(streamlib.requestedUrls).toEqual([PINNED_CONTRACT_URL, releaseContractUrl("v0.69.87")]);
  expect(contractVersionPlan).toEqual({
    outputLines: [`pinned_streamlib_commit=${PINNED_STREAMLIB_COMMIT}`, "streamlib_release_serves_the_pinned_contract_version=true"],
    warning: null,
  });
});

test("a release that carries no contract skips both builds, with a warning that says so", async () => {
  const streamlib = streamlibServing({ [PINNED_CONTRACT_URL]: () => contractAnswering(3) });
  const contractVersionPlan = await planTheContractVersion({ fetchContract: streamlib.fetchContract, pinFileText: PIN_FILE_TEXT, streamlibTag: "v0.68.72" });
  expect(contractVersionPlan.outputLines).toContain("streamlib_release_serves_the_pinned_contract_version=false");
  expect(contractVersionPlan.warning).toContain(`streamlib v0.68.72 carries no ${CONTRACT_PATH}`);
  expect(contractVersionPlan.warning).toContain("which serves version 3");
});

test("a release whose contract answers a server error, or cannot be reached, fails the plan", async () => {
  const answeringAServerError = streamlibServing({
    [PINNED_CONTRACT_URL]: () => contractAnswering(3),
    [releaseContractUrl("v0.69.87")]: () => new Response("", { status: 503 }),
  });
  await expect(
    planTheContractVersion({ fetchContract: answeringAServerError.fetchContract, pinFileText: PIN_FILE_TEXT, streamlibTag: "v0.69.87" }),
  ).rejects.toThrow(`${releaseContractUrl("v0.69.87")} answered 503`);

  const unreachable = streamlibServing({
    [PINNED_CONTRACT_URL]: () => contractAnswering(3),
    [releaseContractUrl("v0.69.87")]: () => Promise.reject(new TypeError("fetch failed")),
  });
  await expect(planTheContractVersion({ fetchContract: unreachable.fetchContract, pinFileText: PIN_FILE_TEXT, streamlibTag: "v0.69.87" })).rejects.toThrow(
    "fetch failed",
  );
});

test("a pin that names no full commit, or a pinned commit that carries no contract, fails the plan", async () => {
  const streamlib = streamlibServing({});
  await expect(
    planTheContractVersion({ fetchContract: streamlib.fetchContract, pinFileText: JSON.stringify({ streamlib_commit: "836cc5b" }), streamlibTag: "v0.69.87" }),
  ).rejects.toThrow("the runtime client pin names no full streamlib commit: 836cc5b");
  await expect(planTheContractVersion({ fetchContract: streamlib.fetchContract, pinFileText: PIN_FILE_TEXT, streamlibTag: "v0.69.87" })).rejects.toThrow(
    `streamlib ${PINNED_STREAMLIB_COMMIT}, which the app's runtime client is pinned to, carries no ${CONTRACT_PATH}`,
  );
});

test("a contract's version is read from x-contract-version under info, and one naming none is refused", () => {
  expect(contractVersionOfTheContract({ openrpc: "1.3.2", info: { version: "3", "x-contract-version": 3 } }, "contract.json")).toBe(3);
  expect(() => contractVersionOfTheContract({ info: { version: "3" } }, "streamlib v0.1.0 contract.json")).toThrow(
    "streamlib v0.1.0 contract.json names no x-contract-version under info",
  );
});
