import type { MockLiveLogWriter, MockLogRecordDraft, MockStreamFixture } from "./mock_stream_fixtures";
import type { ProjectLogRecord, StreamActionVenvSync } from "../src/shared/tatolab_backend_contract";

/** How long the mock takes to answer a command, as the app would over IPC. */
export const MOCK_COMMAND_LATENCY_MILLISECONDS = 30;

/** How long the mock runtime takes to come up in the `starting` scenario. */
export const MOCK_RUNTIME_STARTUP_MILLISECONDS = 2400;

/** How often the mock advances each loaded stream's log while the runtime is up. */
export const MOCK_LIVE_TICK_MILLISECONDS = 700;

/** How long a loaded stream takes to settle into running. */
export const MOCK_STREAM_SETTLE_MILLISECONDS = 1600;

/** The runtime's words for an `open_project` it fails while a record an earlier runtime wrote from another folder holds the project's stream id. */
export const mockOpenRefusedForAnEarlierRuntimesRecord = (projectDirectory: string): string =>
  `Stream graph error: the stream id \`pulse-stage-main\` of the stream asset 7a9e1c3b-2d4f-4e6a-8b1c-5f3e9d2a4c68 of the project 0d4c4e2a-6f1b-4a57-9d0e-3b2f8c1a7e55 in ${projectDirectory} is held by a record an earlier runtime wrote from ${projectDirectory}-copy; two streams cannot share one id, so \`rm\` the stream that holds it, or give a second copy of a project its own project UUID`;

/** How long `main` stays listed but not loaded in the `loading` scenario. */
export const MOCK_MAIN_LOADING_MILLISECONDS = 9000;

/** How many records one page of a project log holds at most. */
export const MOCK_RECORDS_PAGE_SIZE = 500;

/** How long each step of a queued stream action takes in the mock. */
export const MOCK_STREAM_ACTION_STEP_MILLISECONDS = 700;

/** The kinds of the mock's queued project loads, as `describe_stream_action` names them. */
export type MockProjectLoadKind = "open" | "start_playback" | "load";

/** Whether a mock project load leaves its streams playing or held stopped with their graphs loaded. */
export type MockProjectPlaybackAfterItsLoad = "playing" | "held_stopped";

/** How long each step of the mock app update download takes. */
export const MOCK_UPDATE_DOWNLOAD_STEP_MILLISECONDS = 250;

/** How far each step of the mock app update download goes. */
export const MOCK_UPDATE_DOWNLOAD_STEP_PERCENT = 7;

/** How long the mock runtime has been up as the page opens: 3 days, 2 hours and 14 minutes. */
export const MOCK_RUNTIME_UP_FOR_AT_OPEN_MILLISECONDS = ((3 * 24 + 2) * 60 + 14) * 60_000;

/** How long the mock runtime's uv takes to make a project's `.venv`, before it compiles it. */
export const MOCK_PYTHON_ENVIRONMENT_MILLISECONDS = 3200;

/** What the mock's uv has done at each stage of making a project's `.venv`, shaped as uv 0.13's lines for a numpy and pillow sync make the runtime's `venv_sync`. */
export const MOCK_VENV_SYNC_STAGES: readonly StreamActionVenvSync[] = [
  { phase: "resolving", packages_resolved: null, packages_prepared: null, packages_installed: null, downloads_started: 0, downloads_done: 0, packages: [] },
  {
    phase: "downloading",
    packages_resolved: 8,
    packages_prepared: null,
    packages_installed: null,
    downloads_started: 2,
    downloads_done: 1,
    packages: [
      { name: "numpy", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 16_672_358 },
      { name: "pillow", version: null, kind: "distribution", state: "downloading", download_size_bytes: 7_130_317 },
    ],
  },
  {
    phase: "installing",
    packages_resolved: 8,
    packages_prepared: 8,
    packages_installed: null,
    downloads_started: 2,
    downloads_done: 2,
    packages: [
      { name: "numpy", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 16_672_358 },
      { name: "pillow", version: null, kind: "distribution", state: "downloaded", download_size_bytes: 7_130_317 },
    ],
  },
  {
    phase: "installed",
    packages_resolved: 8,
    packages_prepared: 8,
    packages_installed: 8,
    downloads_started: 2,
    downloads_done: 2,
    packages: [
      { name: "numpy", version: "2.3.4", kind: "distribution", state: "installed", download_size_bytes: 16_672_358 },
      { name: "pillow", version: "12.0.0", kind: "distribution", state: "installed", download_size_bytes: 7_130_317 },
    ],
  },
];

/** The folders the mock runtime draws a new project in under `~/streams`, the first one free. */
export const MOCK_NEW_PROJECT_FOLDER_NAMES = ["kind-butte", "quiet-harbor", "amber-delta"];

/** The stream asset of the mock's doorways project that fails to load, as a stream whose camera is missing does. */
export const MOCK_FAILING_STREAM_NAME = "back_door";

/** What the runtime's uv says in the mock when `?add_venv=refused` has it fail to make a project's `.venv`: the package index out of reach. */
export const MOCK_UV_SYNC_REFUSAL = [
  "error: Failed to fetch: `https://pypi.org/simple/tatolab-stream/`",
  "  Caused by: Request failed after 3 retries",
  "  Caused by: error sending request for url (https://pypi.org/simple/tatolab-stream/)",
  "  Caused by: dns error: failed to lookup address information: nodename nor servname provided, or not known",
].join("\n");

/** A stream the mock runtime holds loaded. */
export interface MockLoadedStream {
  fixture: MockStreamFixture;
  /** The stream action that loaded it, which every record its load writes carries. */
  loadAction: string;
  loadedAtMilliseconds: number;
  unreleasedStartupDrafts: MockLogRecordDraft[];
  writeLiveLog: MockLiveLogWriter;
}

/** A project's log as the mock keeps it: its records oldest first, after the ones its retention deleted. */
export interface MockProjectLog {
  records: ProjectLogRecord[];
  recordsDeletedCount: number;
}
