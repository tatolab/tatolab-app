import { readFile } from "node:fs/promises";
import { ManagedRuntime } from "effect";
import { afterEach, expect, test } from "vitest";
import { checkLinkCandidatesInTheOpenProjectCommand } from "./check_link_candidates_in_the_open_project_command.js";
import { controlOperationRefusedResponse, controlOperationResultResponse, FakeLocalApiServer } from "./fake_local_api_server.js";
import { PROJECTS_WINDOW_CONTENTS_ID } from "./fake_tatolab_electron_app_shell.js";
import { controlOperationCallsReceivedBy } from "./runtime_operations_test_support.js";
import { createTatolabAppLog } from "./tatolab_app_log.js";
import { cleanUpTheFakesTheLastTestMade, cleanUps, FROM_THE_PROJECTS_WINDOW, studioServicesLayerForTest } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

const EVERY_PIN_KIND = "/home/sam/projects/every-pin-kind";
/** The stream asset and the node the recording was made on: the sample's `main` and its `beat` node. */
const STREAM_ASSET = "f0b00b1e-b952-44c8-81e5-6d44602e7fb4";
const BEAT = "2f44fe9c-94cb-4bf0-af2c-b91345adc7c9";
const FROM_THE_STUDIO_WINDOW = { windowContentsId: PROJECTS_WINDOW_CONTENTS_ID + 1 };
const BEAT_COUNT_AMONG_PLACED_PORTS = { stream: STREAM_ASSET, from: { output: { node: BEAT, port: "count" } }, among: "placed_ports", include_refused: true } as const;

/** The window's `check_link_candidates_in_the_open_project` on the live `RuntimeControl` over `server`, in the studio window of every-pin-kind, whose one listed stream asset is `STREAM_ASSET`. */
function checkCommandOver(server: FakeLocalApiServer) {
  cleanUps.push(() => server.close());
  const studioRuntime = ManagedRuntime.make(
    studioServicesLayerForTest({
      localApiSocketPath: server.localApiSocketPath,
      localApiTimeLimitMs: 2_000,
      studioWindow: { windowContentsId: FROM_THE_STUDIO_WINDOW.windowContentsId, projectFolder: EVERY_PIN_KIND },
      streamAssetsOfTheProject: (projectFolder) => new Set(projectFolder === EVERY_PIN_KIND ? [STREAM_ASSET] : []),
      author: { kind: "person", name: "sam" },
      tatolabAppLog: createTatolabAppLog("debug", () => undefined),
    }),
  );
  cleanUps.push(() => studioRuntime.dispose());
  return checkLinkCandidatesInTheOpenProjectCommand(studioRuntime);
}

/** The `result` of the runtime's recorded answer for the `beat` node's `count` output among the sample's placed ports. */
async function recordedAnswerOfBeatCount(): Promise<unknown> {
  const recording = await readFile(new URL("../../mock/recordings/every-pin-kind-link-candidates-of-the-beat-count-output-among-placed-ports.json", import.meta.url), "utf8");
  const response: { result: unknown } = JSON.parse(recording);
  return response.result;
}

test("a wire drag's question reaches the runtime's check_link_candidates as the window asked it, and its answer comes back unchanged", async () => {
  const answered = await recordedAnswerOfBeatCount();
  const server = await FakeLocalApiServer.answering([controlOperationResultResponse(answered)]);
  const check = checkCommandOver(server);

  expect(await check(BEAT_COUNT_AMONG_PLACED_PORTS, FROM_THE_STUDIO_WINDOW)).toEqual({ ok: true, value: answered });
  expect(controlOperationCallsReceivedBy(server)).toEqual([["check_link_candidates", BEAT_COUNT_AMONG_PLACED_PORTS]]);
});

test("a refusal of the runtime's comes back in its own words", async () => {
  // As the runtime refused a question asked inside a placed stream.
  const runtimeWords = "check_link_candidates failed: the link is inside a placed stream; check one at the stream's own level, with `level` omitted, and such a link is not checked yet";
  const server = await FakeLocalApiServer.answering([controlOperationRefusedResponse(runtimeWords, { refusal_code: "refused", action: "check_link_candidates", runtime_words: runtimeWords })]);
  const check = checkCommandOver(server);

  expect(await check({ ...BEAT_COUNT_AMONG_PLACED_PORTS, level: ["01ccd74d-f7e1-4fa5-a400-5c42ad278f19"] }, FROM_THE_STUDIO_WINDOW)).toEqual({ ok: false, refusal: runtimeWords });
});

test("a question naming another project's stream asset, sent from the Projects window or off the contract, is refused in Studio's words before it reaches the runtime", async () => {
  const server = await FakeLocalApiServer.answering([]);
  const check = checkCommandOver(server);
  const anotherProjectsStream = "0c4e2f9a-7b13-4d58-a6e1-3f9b2c7d8e10";

  expect(await check({ ...BEAT_COUNT_AMONG_PLACED_PORTS, stream: anotherProjectsStream }, FROM_THE_STUDIO_WINDOW)).toEqual({
    ok: false,
    refusal: `The stream asset ${anotherProjectsStream} is not one of the streams the runtime lists in ${EVERY_PIN_KIND}.`,
  });
  expect(await check(BEAT_COUNT_AMONG_PLACED_PORTS, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "No project is open in this window." });
  expect((await check({ ...BEAT_COUNT_AMONG_PLACED_PORTS, among: "every_port" }, FROM_THE_STUDIO_WINDOW)).ok).toBe(false);
  expect(server.receivedRequests()).toEqual([]);
});

const liveLocalApiSocket = process.env["TATOLAB_APP_LIVE_LOCAL_API_SOCKET"] ?? "";
const liveLoadedStreamAsset = process.env["TATOLAB_APP_LIVE_LOADED_STREAM_ASSET"] ?? "";
test.skipIf(liveLocalApiSocket === "" || liveLoadedStreamAsset === "")("a real runtime answers a wire drag's question, and refuses one from a node its graph does not hold in its own words", async () => {
  const studioRuntime = ManagedRuntime.make(
    studioServicesLayerForTest({
      localApiSocketPath: liveLocalApiSocket,
      localApiTimeLimitMs: 5_000,
      studioWindow: { windowContentsId: FROM_THE_STUDIO_WINDOW.windowContentsId, projectFolder: EVERY_PIN_KIND },
      streamAssetsOfTheProject: () => new Set([liveLoadedStreamAsset]),
      author: { kind: "person", name: "sam" },
      tatolabAppLog: createTatolabAppLog("debug", () => undefined),
    }),
  );
  cleanUps.push(() => studioRuntime.dispose());
  const check = checkLinkCandidatesInTheOpenProjectCommand(studioRuntime);
  const nodeNoGraphHolds = "00000000-0000-4000-8000-000000000001";

  expect(await check({ stream: liveLoadedStreamAsset, from: { output: { node: nodeNoGraphHolds, port: "video" } }, among: "placed_ports" }, FROM_THE_STUDIO_WINDOW)).toEqual({
    ok: false,
    refusal: expect.stringContaining(`holds no node ${nodeNoGraphHolds}`),
  });
});
