// The host a first-party view is served by, in the window itself: the contract's connection answered
// synchronously from what the studio holds.

import { Component, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { WaitingState } from "../design_system/waiting_state";
import type { ListedStreamsReading, OpenWorkspaceReading, StopWatching, StreamTabAddress, StudioSelection } from "./studio_view_contract";
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
  openWorkspace: WatchedStudioValue<OpenWorkspaceReading>;
  listedStreams: WatchedStudioValue<ListedStreamsReading>;
  selection: WatchedStudioValue<StudioSelection>;
  activeStreamTab: WatchedStudioValue<StreamTabAddress | null>;
  openStreamTab(streamTab: StreamTabAddress): void;
}

/** The services every first-party view is handed, read from `sources`. */
export function inWindowStudioViewHostServices(sources: InWindowStudioViewHostSources): StudioViewHostServices {
  return {
    watchOpenWorkspace: sources.openWorkspace.watch,
    watchListedStreams: sources.listedStreams.watch,
    watchSelection: sources.selection.watch,
    select: (selection) => sources.selection.publish(selection),
    watchActiveStreamTab: sources.activeStreamTab.watch,
    openStreamTab: (streamTab) => sources.openStreamTab(streamTab),
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
