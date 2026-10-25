// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// The browser mock's `graph` tool: a mock stream's graph rendered as the runtime renders its
// document — node ids, config, ports, components with state and metrics, link ids and ends,
// `exposed`, `machine` — and the summary the main process would read from it. The preview page
// is a stand-in drawn in the frame itself, since no runtime serves `/watch/` to a browser mock.

import { mockNodeIdOf, type MockStreamGraph } from "./mock_stream_fixtures";
import type { StreamGraphNode, StreamGraphSummary } from "../../shared/tatolab_backend_contract";

/** Where a mock stream's run stands when its graph is read. */
export interface MockStreamGraphMoment {
  /** Whether its nodes have started; before they have, they read `Pending` and their links `pending`. */
  hasSettled: boolean;
  /** How long its counters have been climbing. */
  secondsSinceSettled: number;
}

/** The runtime's capitalised link state in `components`: `awaiting_remote` reads `AwaitingRemote`. */
function linkComponentState(linkState: string): string {
  return linkState
    .split("_")
    .map((word) => (word === "" ? word : word[0].toUpperCase() + word.slice(1)))
    .join("");
}

/** A link's source, a node in another stream rendered with that stream beside it, as `<stream>/<node>` names it in the summary. */
function linkSourceAsTheRuntimeRendersIt(sourceNode: string, sourcePort: string): { stream?: string; node: string; port: string } {
  const streamSeparator = sourceNode.indexOf("/");
  if (streamSeparator === -1) return { node: sourceNode, port: sourcePort };
  return { stream: sourceNode.slice(0, streamSeparator), node: sourceNode.slice(streamSeparator + 1), port: sourcePort };
}

/** A stand-in for the runtime's preview page of `address`: moving colour bars and the address, drawn in the frame. */
function mockWatchPageUrl(address: string): string {
  const standInPage = `<!doctype html><html><body style="margin:0;background:#000;overflow:hidden">
<canvas id="c" style="width:100vw;height:100vh;display:block"></canvas>
<script>
const c=document.getElementById("c"),g=c.getContext("2d"),bars=["#c0c0c0","#c0c000","#00c0c0","#00c000","#c000c0","#c00000","#0000c0"];
function draw(t){c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;const w=c.width,h=c.height;
bars.forEach((b,i)=>{g.fillStyle=b;g.fillRect(i*w/7,0,w/7+1,h*.72)});
const s=(t/1000)%1;g.fillStyle="#111";g.fillRect(0,h*.72,w,h*.28);g.fillStyle="#fff";g.fillRect(s*w,h*.72,w/40,h*.28);
g.font=(18*devicePixelRatio)+"px ui-monospace,monospace";g.fillStyle="#fff";g.fillText("Mock preview · "+${JSON.stringify(address)},16*devicePixelRatio,h-18*devicePixelRatio);
requestAnimationFrame(draw)}requestAnimationFrame(draw);
</script></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(standInPage)}`;
}

/** The `graph {stream}` document of `graph` for `streamName` on `machineName` at `moment`, and the summary read from it. */
export function mockStreamGraphSummary(streamName: string, machineName: string, graph: MockStreamGraph, moment: MockStreamGraphMoment): StreamGraphSummary {
  const nodeState = (state: string) => (moment.hasSettled ? state : "Pending");
  const linkState = (state: string) => (moment.hasSettled ? state : "pending");
  const climbed = (perSecond: number) => (moment.hasSettled ? Math.floor(perSecond * moment.secondsSinceSettled) : 0);
  const nodes: StreamGraphNode[] = graph.nodes.map((node) => ({
    id: mockNodeIdOf(streamName, node.name),
    name: node.name,
    type: node.type,
    state: nodeState(node.state),
    input_ports: node.input_ports,
    output_ports: node.output_ports,
    dropped_bags_by_link: Object.fromEntries(
      graph.links.filter((link) => link.target_node === node.name).map((link) => [link.id, climbed(graph.counterRates.droppedPerSecondByLinkId[link.id] ?? 0)]),
    ),
    refused_bags_by_output_port: Object.fromEntries(
      [...new Set([...graph.links.filter((link) => link.source_node === node.name).map((link) => link.source_port)])].map((port) => [
        port,
        climbed(graph.counterRates.refusedPerSecondByOutput.find((output) => output.node === node.name && output.port === port)?.perSecond ?? 0),
      ]),
    ),
  }));
  const graphDocument = {
    stream: streamName,
    nodes: graph.nodes.map((node, nodeIndex) => ({
      id: mockNodeIdOf(streamName, node.name),
      type: node.type,
      name: node.name,
      config: node.config,
      ports: {
        inputs: node.input_ports.map((port) => ({ name: port.name, description: "", port_kind: "data", delivery_profile: "newest" })),
        outputs: node.output_ports.map((port) => ({
          name: port.name,
          description: "",
          port_kind: "data",
          delivery_profile: null,
          ...(port.catalog_section === null ? {} : { catalog_entry: { section: port.catalog_section, entry: {} } }),
        })),
      },
      components: {
        state: nodes[nodeIndex]?.state ?? null,
        paused: false,
        metrics: {
          frames_dropped: 0,
          dropped_bags_by_link: nodes[nodeIndex]?.dropped_bags_by_link ?? {},
          refused_bags_by_output_port: nodes[nodeIndex]?.refused_bags_by_output_port ?? {},
        },
      },
    })),
    links: graph.links.map((link) => ({
      id: link.id,
      source: linkSourceAsTheRuntimeRendersIt(link.source_node, link.source_port),
      target: { node: link.target_node, port: link.target_port },
      capacity: 4,
      state: linkState(link.state),
      components: { state: linkComponentState(linkState(link.state)) },
    })),
    exposed: graph.exposed,
    machine: machineName,
  };
  return {
    stream: streamName,
    nodes,
    links: graph.links.map((link) => ({ ...link, state: linkState(link.state) })),
    exposed: graph.exposed.map((exposedPort) => ({
      ...exposedPort,
      watch_page_url: exposedPort.level === "internal" ? null : mockWatchPageUrl(`${machineName}/${streamName}/${exposedPort.node}/${exposedPort.port}`),
    })),
    graph_document_text: JSON.stringify(graphDocument, null, 2),
  };
}
