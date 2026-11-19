// One stream's input values as the host serves them to its views: every input's value at every
// level as the stream's latest graph reading holds it, with each change the runtime announced since
// applied on top, so a value set live reaches every view with no graph read. A change announced
// while a read is in flight may be missing from what that read answers, so it is applied again once
// the read lands; one announced before the read started is in the read already.

import { fragmentOfTheNode, inputValueReadOfThePort, type StreamGraph, type StreamGraphInputValueChange, type StreamGraphNode } from "../../shared/tatolab_backend_contract";
import type { StreamInputValue, StreamInputValuesReading } from "./studio_view_contract";
import { jsonTextOf } from "@tatolab/tato-app-view-sdk/studio_readings";

/** The values of one graph reading, each input's by its node and name. */
interface ValuesOfAReading {
  readonly stream_asset: string | null;
  readonly values: Map<string, StreamInputValue>;
}

const keyOfTheInput = (nodeId: string, input: string): string => JSON.stringify([nodeId, input]);

/** Every input of `nodes` at `level`, and of the subgraphs inside them, that holds a value or names the link that feeds it. */
function keepTheValuesOfTheLevel(nodes: readonly StreamGraphNode[], level: string[], kept: ValuesOfAReading): void {
  for (const node of nodes) {
    for (const port of node.ports.inputs) {
      const valueRead = inputValueReadOfThePort(port);
      if (valueRead !== null) kept.values.set(keyOfTheInput(node.id, port.name), { level, node_id: node.id, input: port.name, value_read: valueRead });
    }
    const fragment = fragmentOfTheNode(node);
    if (fragment !== null) keepTheValuesOfTheLevel(fragment.nodes, [...level, node.id], kept);
  }
}

function valuesOfTheReading(graph: StreamGraph): ValuesOfAReading {
  const kept: ValuesOfAReading = { stream_asset: graph.asset ?? null, values: new Map() };
  keepTheValuesOfTheLevel(graph.nodes, [], kept);
  return kept;
}

const readTheSame = (a: StreamInputValue["value_read"], b: StreamInputValue["value_read"]): boolean => a.comes_from === b.comes_from && jsonTextOf(a.value) === jsonTextOf(b.value);

/** Apply `change` to `kept`, answering the input's new value; `null` when the reading holds no such input, or it already reads that. */
function applyTheChange(kept: ValuesOfAReading, change: StreamGraphInputValueChange): StreamInputValue | null {
  const key = keyOfTheInput(change.node, change.input);
  const before = kept.values.get(key);
  if (before === undefined || readTheSame(before.value_read, change.value_read)) return null;
  const after: StreamInputValue = { ...before, value_read: change.value_read };
  kept.values.set(key, after);
  return after;
}

const valuesReadingOf = (kept: ValuesOfAReading): StreamInputValuesReading => ({ kind: "values", stream_asset: kept.stream_asset, values: [...kept.values.values()] });

/** One stream's input values, kept from its graph readings and the changes the runtime announces, told to each watcher. */
export class StreamInputValuesReadings {
  private kept: ValuesOfAReading | null = null;
  private keptJson: string | null = null;
  /** The changes announced since the read in flight started; `null` while none is. */
  private changesSinceTheReadStarted: StreamGraphInputValueChange[] | null = null;
  private readonly listeners = new Set<(reading: StreamInputValuesReading) => void>();

  get watcherCount(): number {
    return this.listeners.size;
  }

  /** Tell `listener` every input's value once there is a reading, then each change. */
  watch(listener: (reading: StreamInputValuesReading) => void): () => void {
    this.listeners.add(listener);
    if (this.kept !== null) listener(valuesReadingOf(this.kept));
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A read of the graph starts: a change announced from now on may be missing from what it answers. */
  readStarting(): void {
    this.changesSinceTheReadStarted = [];
  }

  /** The read in flight landed with `graph`, or `null` when it failed; values that differ from those kept are told to every watcher. */
  readLanded(graph: StreamGraph | null): void {
    const changesSinceTheReadStarted = this.changesSinceTheReadStarted ?? [];
    this.changesSinceTheReadStarted = null;
    if (graph === null) return;
    const kept = valuesOfTheReading(graph);
    for (const change of changesSinceTheReadStarted) applyTheChange(kept, change);
    const reading = valuesReadingOf(kept);
    const readingJson = jsonTextOf(reading);
    this.kept = kept;
    if (readingJson === this.keptJson) return;
    this.keptJson = readingJson;
    this.tellEveryWatcher(reading);
  }

  /** The runtime announced `change`: apply it to the values kept and tell every watcher, when it changes what an input reads. */
  takeTheChange(change: StreamGraphInputValueChange): void {
    this.changesSinceTheReadStarted?.push(change);
    if (this.kept === null) return;
    const changed = applyTheChange(this.kept, change);
    if (changed === null) return;
    this.keptJson = null;
    this.tellEveryWatcher({ kind: "changed", stream_asset: this.kept.stream_asset, change: changed });
  }

  private tellEveryWatcher(reading: StreamInputValuesReading): void {
    for (const listener of [...this.listeners]) listener(reading);
  }
}
