// The host a first-party view is served by, in the window itself: the contract's connection answered
// synchronously from what the studio holds.

import { Component, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { WaitingState } from "../design_system/waiting_state";
import type { ProjectLogReadings } from "./project_log_readings";
import type { ProjectNodeTypeReadings } from "./project_node_type_readings";
import type { PythonLanguageServerConnections } from "./python_language_server_connections";
import type { PortViewerConnections } from "./port_viewer_connections";
import type { CodeFileAsked, ListedStreamsReading, OpenProjectReading, StopWatching, StreamTabAddress, StudioSelection } from "./studio_view_contract";
import type { StreamGraphAndCatalogReadings } from "./stream_graph_and_catalog_readings";
import type { StudioViewHostServices } from "./studio_view_type_registry";

/** A value every watcher is told of: at once when it starts watching, then on each change. */
export class WatchedStudioValue<Value> {
  private readonly listeners = new Set<(value: Value) => void>();

  constructor(private latestValue: Value) {}

  readonly readLatest = (): Value => this.latestValue;

  readonly watch = (listener: (value: Value) => void): StopWatching => {
    this.listeners.add(listener);
    listener(this.latestValue);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Keep `value` and tell every watcher; a value equal to the last as JSON tells none. */
  publish(value: Value): void {
    if (JSON.stringify(value) === JSON.stringify(this.latestValue)) return;
    this.latestValue = value;
    for (const listener of [...this.listeners]) listener(value);
  }
}

/** `watched`'s latest value, re-rendering the caller on each change. */
export function useWatchedStudioValue<Value>(watched: WatchedStudioValue<Value>): Value {
  return useSyncExternalStore((onChange) => watched.watch(() => onChange()), watched.readLatest);
}

/** What the studio publishes to its views, and what it does when a view opens a stream's tab. */
export interface InWindowStudioViewHostSources {
  openProject: WatchedStudioValue<OpenProjectReading>;
  listedStreams: WatchedStudioValue<ListedStreamsReading>;
  selection: WatchedStudioValue<StudioSelection>;
  activeStreamTab: WatchedStudioValue<StreamTabAddress | null>;
  openStreamTab(streamTab: StreamTabAddress): void;
  codeFileAsked: WatchedStudioValue<CodeFileAsked | null>;
  openCodeFile(file: string): void;
}

/** What the host reads and writes of the open project and its imports for its views: their files through the backend, their logs and node types, their language servers, and the port viewers of their running nodes. */
export interface InWindowProjectServices {
  backend: Pick<TatolabBackend, "readProjectFile" | "saveProjectFile" | "listProjectFiles" | "popOutViewer">;
  projectLogReadings: ProjectLogReadings;
  projectNodeTypeReadings: ProjectNodeTypeReadings;
  pythonLanguageServerConnections: PythonLanguageServerConnections;
  portViewerConnections: PortViewerConnections;
}

/** The services every first-party view is handed, read from `sources`, for a stream's graph and catalog from `streamReadings`, and for the open project and its imports from `projectServices`. */
export function inWindowStudioViewHostServices(
  sources: InWindowStudioViewHostSources,
  streamReadings: StreamGraphAndCatalogReadings,
  projectServices: InWindowProjectServices,
): StudioViewHostServices {
  const { backend } = projectServices;
  return {
    watchOpenProject: sources.openProject.watch,
    watchListedStreams: sources.listedStreams.watch,
    watchSelection: sources.selection.watch,
    select: (selection) => sources.selection.publish(selection),
    watchActiveStreamTab: sources.activeStreamTab.watch,
    openStreamTab: (streamTab) => sources.openStreamTab(streamTab),
    watchStreamGraph: streamReadings.watchStreamGraph,
    watchNodeCatalog: streamReadings.watchNodeCatalog,
    watchCodeFileAsked: sources.codeFileAsked.watch,
    openCodeFile: (file) => sources.openCodeFile(file),
    readProjectFile: (file) =>
      backend.readProjectFile(file).then(
        (fileRead) => ({ kind: "read", file_read: fileRead }),
        (rejection: unknown) => ({ kind: "not_read", because: describeBackendRejection(rejection) }),
      ),
    saveProjectFile: (file, text, basedOnVersion) =>
      backend.saveProjectFile(file, text, basedOnVersion).then(
        (fileSaved) => ({ kind: "saved", version: fileSaved.version }),
        (rejection: unknown) => ({ kind: "not_saved", because: describeBackendRejection(rejection) }),
      ),
    listProjectFiles: (projectFolder) =>
      backend.listProjectFiles(projectFolder).then(
        (projectFiles) => ({ kind: "listed", project_files: projectFiles }),
        (rejection: unknown) => ({ kind: "not_listed", because: describeBackendRejection(rejection) }),
      ),
    popOutViewer: (target) =>
      backend.popOutViewer(target).then(
        () => ({ kind: "popped_out" }),
        (rejection: unknown) => ({ kind: "not_popped_out", because: describeBackendRejection(rejection) }),
      ),
    watchProjectLog: projectServices.projectLogReadings.watchProjectLog,
    watchProjectNodeTypes: projectServices.projectNodeTypeReadings.watchProjectNodeTypes,
    connectToPythonLanguageServer: projectServices.pythonLanguageServerConnections.connectToPythonLanguageServer,
    watchPortViewer: projectServices.portViewerConnections.watchPortViewer,
  };
}

/** The latest reading `watch` gives, re-rendering the caller on each; `null` until the first arrives. `watch` must keep its identity between renders. */
export function useStudioViewReading<Reading>(watch: (listener: (reading: Reading) => void) => StopWatching): Reading | null {
  const [reading, setReading] = useState<{ latest: Reading } | null>(null);
  useLayoutEffect(() => watch((latest) => setReading({ latest })), [watch]);
  return reading === null ? null : reading.latest;
}

/** Shows a view that failed while drawing, in the failure's own words, so the other areas keep running. */
export class StudioViewFailureBoundary extends Component<{ viewTitle: string; children: ReactNode }, { failureWords: string | null }> {
  override state: { failureWords: string | null } = { failureWords: null };

  static getDerivedStateFromError(failure: unknown): { failureWords: string } {
    return { failureWords: failure instanceof Error ? failure.message : String(failure) };
  }

  override render(): ReactNode {
    if (this.state.failureWords === null) return this.props.children;
    return <WaitingState isFailure title={`${this.props.viewTitle} stopped drawing`} explanation={this.state.failureWords} />;
  }
}
