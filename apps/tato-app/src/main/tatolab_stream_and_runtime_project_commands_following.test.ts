import { Effect, ManagedRuntime } from "effect";
import { afterEach, expect, test, vi } from "vitest";
import { fakeRuntimeOfConnections } from "./control_connection_test_support.js";
import { streamAndRuntimeProjectCommandHandlersOf } from "./tatolab_stream_and_runtime_project_commands.js";
import { FROM_THE_PROJECTS_WINDOW, STUDIO_WINDOW_UNDER_TEST, studioServicesLayerForTest } from "./tatolab_commands_test_support.js";
import { StreamGraphsFollowed } from "./studio_runtime.js";

const FROM_A_STUDIO_WINDOW = { windowContentsId: STUDIO_WINDOW_UNDER_TEST.windowContentsId };
const disposals: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()));
});

/** A studio window recording each stream graph and project log it is told changed. */
function studioWindowFollowingTheRuntime() {
  const streamGraphsToldChanged: string[] = [];
  return {
    streamGraphsToldChanged,
    sendTheWindowTheStreamGraphChanged: (stream: string) => void streamGraphsToldChanged.push(stream),
    sendTheWindowTheProjectLogRecordsWritten: () => {},
  };
}

/** The window's commands on the runtime's streams, in a Studio whose studio window is `windowFollowing`, following over a fake runtime holding `main`. */
function commandsFollowingOverAFakeRuntime(windowFollowing: ReturnType<typeof studioWindowFollowingTheRuntime>) {
  const runtime = fakeRuntimeOfConnections({
    subscribe_stream_graph_changes: ({ streams }) => Effect.succeed({ streams }),
    subscribe_input_value_changes: ({ streams }) => Effect.succeed({ streams }),
  });
  const studioRuntime = ManagedRuntime.make(studioServicesLayerForTest({ runtimeControlOfThePushes: runtime.layer, windowFollowingTheRuntime: windowFollowing }));
  disposals.push(() => studioRuntime.dispose());
  return { ...runtime, studioRuntime, commands: streamAndRuntimeProjectCommandHandlersOf(studioRuntime) };
}

test("a studio window following a stream's graph is told once it is subscribed and of each change, and stopping closes the connection", async () => {
  const studioWindow = studioWindowFollowingTheRuntime();
  const { commands, connectionsOpened } = commandsFollowingOverAFakeRuntime(studioWindow);

  expect(await commands.follow_stream_graph_changes({ stream: "main" }, FROM_A_STUDIO_WINDOW)).toEqual({ ok: true, value: null });
  await vi.waitFor(() => expect(studioWindow.streamGraphsToldChanged).toEqual(["main"]));
  connectionsOpened[0]?.push("stream_graph_changed", { stream: "main", change: "missed" });
  await vi.waitFor(() => expect(studioWindow.streamGraphsToldChanged).toEqual(["main", "main"]));
  expect(connectionsOpened[0]?.callsMade.map(([method]) => method)).toEqual(["subscribe_stream_graph_changes", "subscribe_input_value_changes"]);

  expect(await commands.stop_following_stream_graph_changes({ stream: "main" }, FROM_A_STUDIO_WINDOW)).toEqual({ ok: true, value: null });
  await vi.waitFor(() => expect(connectionsOpened[0]?.closedByTheApp).toBe(true));
});

test("the Projects window is refused following a stream's graph, and its stop does nothing", async () => {
  const { commands, connectionsOpened } = commandsFollowingOverAFakeRuntime(studioWindowFollowingTheRuntime());

  expect(await commands.follow_stream_graph_changes({ stream: "main" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "Only a studio window or a popped-out view follows a stream's graph." });
  expect(await commands.stop_following_stream_graph_changes({ stream: "main" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(connectionsOpened).toEqual([]);
});

test("a window that closes stops following every stream graph, and the connection closes", async () => {
  const studioWindow = studioWindowFollowingTheRuntime();
  const { commands, connectionsOpened, studioRuntime } = commandsFollowingOverAFakeRuntime(studioWindow);
  await commands.follow_stream_graph_changes({ stream: "main" }, FROM_A_STUDIO_WINDOW);
  await commands.follow_stream_graph_changes({ stream: "lobby" }, FROM_A_STUDIO_WINDOW);
  await vi.waitFor(() => expect(studioWindow.streamGraphsToldChanged.sort()).toEqual(["lobby", "main"]));

  await studioRuntime.runPromise(StreamGraphsFollowed.use((followed) => followed.stopFollowingEverySubjectOf(studioWindow)));

  await vi.waitFor(() => expect(connectionsOpened[0]?.closedByTheApp).toBe(true));
  expect(connectionsOpened).toHaveLength(1);
});
