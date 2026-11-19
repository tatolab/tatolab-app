import { useSyncExternalStore } from "react";
import type { StopWatching } from "./studio_view_contract";
import { jsonTextOf } from "@tatolab/tato-app-view-sdk/studio_readings";

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

  /** Keep `value` and tell every watcher; a value equal to the last as JSON text tells none. */
  publish(value: Value): void {
    if (jsonTextOf(value) === jsonTextOf(this.latestValue)) return;
    this.latestValue = value;
    for (const listener of [...this.listeners]) listener(value);
  }
}

/** `watched`'s latest value, re-rendering the caller on each change. */
export function useWatchedStudioValue<Value>(watched: WatchedStudioValue<Value>): Value {
  return useSyncExternalStore((onChange) => watched.watch(() => onChange()), watched.readLatest);
}
