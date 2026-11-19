import { isAnOutputOfAValueSource, mockMessageOnTheOutputOfAValueSource } from "./mock_value_sources";
import { mockGraphNodeIdOf } from "./mock_stream_fixtures";
import { MockPythonLanguageServer } from "./mock_python_language_server";
import type { TatolabBackend } from "../src/renderer/backend/tatolab_backend";
import type { PoppedOutView, RuntimeDescription } from "../src/shared/tatolab_backend_contract";
import { MOCK_RUNTIME_VERSION, POPPED_OUT_VIEW_QUERY_PARAMETER } from "./mock_tatolab_options";
import { MOCK_COMMAND_LATENCY_MILLISECONDS } from "./mock_tatolab_simulation_constants";
import { mockPageUrlWith, sleep, type MockTatolabSimulation } from "./mock_tatolab_simulation";

/** How long the mock takes to link the `tatolab` command. */
const MOCK_COMMAND_LINE_TOOL_LINK_MILLISECONDS = 400;

const MOCK_RUNTIME_BUILD_ID = "0.55.2+ec6adf522d2bf3a42b3ee9878bdc2717e9388d7a.eecdc9dbaa1025c25565ca507699ed60";

/** How long the mock takes to stop its runtime for a restart. */
const MOCK_RUNTIME_RESTART_MILLISECONDS = 700;

/** The mock page's address with `target` as the view it pops out, every other query parameter kept, so the tab opens with the same scenario. */
export function mockPoppedOutViewPageUrl(pageUrl: string, target: PoppedOutView): string {
  return mockPageUrlWith(pageUrl, POPPED_OUT_VIEW_QUERY_PARAMETER, JSON.stringify(target));
}

/** How long after the window listens the mock's notification click arrives. */
const MOCK_NOTIFICATION_CLICK_MILLISECONDS = 1200;

/** The mock backend's status and runtime methods over `simulation`. */
export function mockStatusAndRuntimeBackendOf(simulation: MockTatolabSimulation): Pick<TatolabBackend, "getTatolabStatus" | "linkCommandLineTool" | "quitTatolabApp" | "readProjectLogRecords" | "followProjectLogRecords" | "stopFollowingProjectLogRecords" | "onProjectLogRecordsWritten" | "describeStreamGraph" | "followStreamGraphChanges" | "stopFollowingStreamGraphChanges" | "onStreamGraphChanged" | "describeRuntime" | "restartRuntime" | "openRuntimeLogFolder" | "onStreamPageRequested" | "showTheProjectsWindow" | "showTheMenusInTheSystemMenuBar" | "onSystemMenuBarEntryChosen" | "popOutView" | "readPoppedOutView" | "pathOfADroppedFile" | "onTatolabStatusChanged" | "startPythonLanguageServer" | "sendToPythonLanguageServer" | "stopPythonLanguageServer" | "onPythonLanguageServerEvent" | "openPortViewer" | "closePortViewer" | "onPortViewerEvent" | "onPortViewerImageFrame"> {
  const { fixtures, statusListeners, openProjectListeners, menusKeptForTheSystemMenuBar, chooseTheSystemMenuBarEntryOnceOffered, mockProjectFiles, languageServerEventListeners, mockLanguageServersBySession, mockPortViewers, refuseWithoutAnOpenProject, streamsWhoseGraphsAreFollowed, streamGraphChangedListeners, projectsWhoseLogsAreFollowed, projectLogRecordsWrittenListeners, publishStatus, listStreams, takeRuntimeDown, startRuntime, noRuntimeAnswersRefusal, loadedStreamOfTheId, readMockProjectLog, graphOfTheStream, doesTheRuntimeKeepNoOwnLog, isTheRuntimeRestartRefused, streamPageRequestedByANotification, mockTatolabOptions } = simulation;
  return {
    getTatolabStatus: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return structuredClone(simulation.mockStatus);
    },
    linkCommandLineTool: async () => {
      await sleep(MOCK_COMMAND_LINE_TOOL_LINK_MILLISECONDS);
      const commandLineToolLink = simulation.mockStatus.command_line_tool_link;
      if (commandLineToolLink.kind === "not_offered") throw commandLineToolLink.reason;
      if (commandLineToolLink.kind === "taken_by_something_else") throw `${commandLineToolLink.path} is not a link to Tatolab, so Tato Studio left it alone.`;
      publishStatus({ command_line_tool_link: { kind: "linked", path: commandLineToolLink.path } });
    },
    quitTatolabApp: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
    },
    readProjectLogRecords: async (projectDirectory, narrowing, after, until) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      const isTheOpenProject = simulation.openProjectReading.kind === "read" && simulation.openProjectReading.open_project.project.folder === projectDirectory;
      if (!isTheOpenProject && !(listStreams() ?? []).some((listing) => listing.location?.project_directory === projectDirectory)) throw `The runtime lists no stream from ${projectDirectory}.`;
      return readMockProjectLog(projectDirectory, narrowing, after, until);
    },
    followProjectLogRecords: async (projectDirectory) => {
      projectsWhoseLogsAreFollowed.add(projectDirectory);
    },
    stopFollowingProjectLogRecords: async (projectDirectory) => {
      projectsWhoseLogsAreFollowed.delete(projectDirectory);
    },
    onProjectLogRecordsWritten: (listener) => {
      projectLogRecordsWrittenListeners.add(listener);
      return () => {
        projectLogRecordsWrittenListeners.delete(listener);
      };
    },
    describeStreamGraph: async (streamId) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      return graphOfTheStream(streamId);
    },
    followStreamGraphChanges: async (streamId) => {
      streamsWhoseGraphsAreFollowed.add(streamId);
    },
    stopFollowingStreamGraphChanges: async (streamId) => {
      streamsWhoseGraphsAreFollowed.delete(streamId);
    },
    onStreamGraphChanged: (listener) => {
      streamGraphChangedListeners.add(listener);
      return () => {
        streamGraphChangedListeners.delete(listener);
      };
    },
    describeRuntime: async (): Promise<RuntimeDescription> => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      return {
        version: MOCK_RUNTIME_VERSION,
        build_id: MOCK_RUNTIME_BUILD_ID,
        up_for_ms: Date.now() - simulation.runtimeEngineStartedAtMilliseconds,
        runtime_log_directory: doesTheRuntimeKeepNoOwnLog ? null : fixtures.machine.runtimeLogDirectory,
      };
    },
    restartRuntime: async () => {
      await sleep(MOCK_RUNTIME_RESTART_MILLISECONDS);
      if (isTheRuntimeRestartRefused) throw "The runtime running now was not started by Tato Studio, so Tato Studio leaves it alone.";
      takeRuntimeDown({ runtime_state: "starting" });
      startRuntime();
    },
    openRuntimeLogFolder: async () => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      if (simulation.mockStatus.runtime_state !== "running") throw noRuntimeAnswersRefusal();
      if (doesTheRuntimeKeepNoOwnLog) throw "The runtime keeps no log of its own, so there is no folder to open.";
    },
    onStreamPageRequested: (streamPageRequestListener) => {
      if (streamPageRequestedByANotification === null) return () => {};
      const notificationClickTimer = window.setTimeout(() => streamPageRequestListener(streamPageRequestedByANotification), MOCK_NOTIFICATION_CLICK_MILLISECONDS);
      return () => window.clearTimeout(notificationClickTimer);
    },
    showTheProjectsWindow: async () => {
      simulation.openProjectReading = { kind: "none_open" };
      for (const openProjectListener of openProjectListeners) openProjectListener(structuredClone(simulation.openProjectReading));
    },
    // A page in a browser has no system menu bar: the mock keeps the menus as the app would, and only `?system_menu_entry=` chooses from them.
    showTheMenusInTheSystemMenuBar: async (menus) => {
      menusKeptForTheSystemMenuBar.splice(0, menusKeptForTheSystemMenuBar.length, ...structuredClone(menus));
      chooseTheSystemMenuBarEntryOnceOffered();
    },
    onSystemMenuBarEntryChosen: (entryChosenListener) => {
      simulation.systemMenuBarEntryChosenListener = entryChosenListener;
      chooseTheSystemMenuBarEntryOnceOffered();
      return () => {
        simulation.systemMenuBarEntryChosenListener = null;
      };
    },
    popOutView: async (target) => {
      window.open(mockPoppedOutViewPageUrl(window.location.href, target), "_blank");
    },
    readPoppedOutView: async () => structuredClone(mockTatolabOptions.poppedOutView),
    pathOfADroppedFile: (droppedFile) => `${fixtures.machine.homeDirectory}/streams/${droppedFile.name}`,
    onTatolabStatusChanged: async (statusListener) => {
      statusListeners.add(statusListener);
      return () => statusListeners.delete(statusListener);
    },
    startPythonLanguageServer: async (projectFolder) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      refuseWithoutAnOpenProject();
      mockProjectFiles.list(projectFolder);
      simulation.languageServerSessionCount += 1;
      const session = `python-language-server-${simulation.languageServerSessionCount}`;
      mockLanguageServersBySession.set(
        session,
        new MockPythonLanguageServer((message) => {
          window.setTimeout(() => {
            if (!mockLanguageServersBySession.has(session)) return;
            for (const listener of languageServerEventListeners) listener({ session, kind: "message", message });
          }, MOCK_COMMAND_LATENCY_MILLISECONDS);
        }),
      );
      return session;
    },
    sendToPythonLanguageServer: async (session, message) => {
      const mockLanguageServer = mockLanguageServersBySession.get(session);
      if (mockLanguageServer === undefined) throw `The language server ${session} has ended.`;
      mockLanguageServer.receive(message);
    },
    stopPythonLanguageServer: async (session) => {
      mockLanguageServersBySession.delete(session);
    },
    onPythonLanguageServerEvent: (listener) => {
      languageServerEventListeners.add(listener);
      return () => languageServerEventListeners.delete(listener);
    },
    openPortViewer: async (target) => {
      await sleep(MOCK_COMMAND_LATENCY_MILLISECONDS);
      const node = loadedStreamOfTheId(target.stream).fixture.graph.nodes.find((graphNode) => mockGraphNodeIdOf(target.stream, graphNode) === target.node_id);
      if (node === undefined) throw `no node with the id \`${target.node_id}\` in stream \`${target.stream}\``;
      const outputPort = node.output_ports.find((port) => port.name === target.port);
      if (outputPort === undefined) throw `\`${node.name}\` has no output port named \`${target.port}\``;
      if (isAnOutputOfAValueSource(node, target.port)) return mockPortViewers.openOnAValueSource(target, mockMessageOnTheOutputOfAValueSource(node, target.port));
      return mockPortViewers.open(target, node.name, outputPort.family, node.not_ready_because !== undefined);
    },
    closePortViewer: async (portViewer) => {
      mockPortViewers.close(portViewer);
    },
    onPortViewerEvent: (listener) => mockPortViewers.onEvent(listener),
    onPortViewerImageFrame: (listener) => mockPortViewers.onImageFrame(listener),
  };
}
