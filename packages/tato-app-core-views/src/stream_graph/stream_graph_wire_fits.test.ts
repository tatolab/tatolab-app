import { nodeGraphPinKey } from "@tatolab/tato-app-view-sdk/design_system/support/node_graph_canvas_contract";
import { aGraphNode, aGraphPort, aStreamGraph } from "@tatolab/tato-app-view-sdk/stream_graph_builders";
import type { LinkCandidatesChecking } from "@tatolab/tato-app-view-sdk/studio_readings";
import { expect, test } from "vitest";
import { editedStreamGraphOf, type EditedStreamGraph } from "../shared/stream_graph_edits";
import { linkCandidatesRequestOf, portsALooseWireFits, wireFitsOfTheAnswer } from "./stream_graph_wire_fits";

const STREAM_ASSET = "f0b00b1e-b952-44c8-81e5-6d44602e7fb4";
const BEAT = "2f44fe9c-94cb-4bf0-af2c-b91345adc7c9";
const WARMTH = "01ccd74d-f7e1-4fa5-a400-5c42ad278f19";
const TALLY = "f511b25f-7028-4320-b538-a152f38695f8";

/** A part of the every-pin-kind sample: `beat` feeding nothing yet, `warmth` and `tally`, each under its runtime id. */
const EDITED: EditedStreamGraph = (() => {
  const edited = editedStreamGraphOf(
    aStreamGraph(
      [
        aGraphNode("beat", { id: BEAT, outputs: [aGraphPort("count")] }),
        aGraphNode("warmth", { id: WARMTH, inputs: [aGraphPort("beats_per_bar"), aGraphPort("base"), aGraphPort("count"), aGraphPort("level")] }),
        aGraphNode("tally", { id: TALLY, inputs: [aGraphPort("picture", { pin_type: { type: "texture" }, flow: "stream" })] }),
      ],
      [],
      { asset: STREAM_ASSET },
    ),
  );
  if ("because" in edited) throw new Error(edited.because);
  return edited;
})();

const BEAT_COUNT = { node_id: "beat", pin: "count", member: null, side: "output" } as const;

test("a wire dragged off a pin asks the runtime from the pin by its node's id, among the placed pins with their refusals or among every node type's ports, at the level shown", () => {
  expect(linkCandidatesRequestOf(EDITED, BEAT_COUNT, [], "placed_ports")).toEqual({ stream: STREAM_ASSET, from: { output: { node: BEAT, port: "count" } }, among: "placed_ports", include_refused: true });
  expect(linkCandidatesRequestOf(EDITED, { node_id: "tally", pin: "picture", member: null, side: "input" }, [WARMTH], "node_type_ports")).toEqual({
    stream: STREAM_ASSET,
    level: [WARMTH],
    from: { input: { node: TALLY, port: "picture" } },
    among: "node_type_ports",
  });
  expect(linkCandidatesRequestOf(EDITED, { node_id: "gone", pin: "video", member: null, side: "output" }, [], "placed_ports")).toBeNull();
});

test("the runtime's answer lights each placed pin by name with its outcome, a refusal and a pin not checked in the runtime's words and a convert node by its name", () => {
  const checking: LinkCandidatesChecking = {
    kind: "checked",
    result: {
      candidates: [
        { end: { kind: "placed_port", node: WARMTH, port: "beats_per_bar" }, check: { outcome: "connects" } },
        { end: { kind: "placed_port", node: WARMTH, port: "base" }, check: { outcome: "connects_with_free_conversion" } },
        {
          end: { kind: "placed_port", node: WARMTH, port: "count" },
          check: {
            outcome: "connects_through_convert_node",
            convert_node: { node_type: "tatolab.stream:TensorToTexture", input_port: "tensor", input_pin_type: { type: "tensor" }, output_port: "image", output_pin_type: { type: "texture" } },
          },
        },
        {
          end: { kind: "placed_port", node: TALLY, port: "picture" },
          check: {
            outcome: "refused",
            refusal: { refusal_code: "refused", action: "connect", refused_operation_index: 0, runtime_words: "cannot link `beat.count` (Integer) to `tally.picture` (Texture): a Integer output does not connect to a Texture input" },
          },
        },
        { end: { kind: "placed_port", node: "00000000-0000-4000-8000-000000000001", port: "video" }, check: { outcome: "connects" } },
      ],
      not_checked: [{ end: { kind: "placed_port", node: WARMTH, port: "level" }, why: "the link closes a loop of function nodes no `PreviousValue` node is in, which `connect` closes through a `PreviousValue` node it adds" }],
    },
  } satisfies LinkCandidatesChecking;

  expect([...wireFitsOfTheAnswer(EDITED, BEAT_COUNT, checking)]).toEqual([
    [nodeGraphPinKey("warmth", "input", "beats_per_bar", null), { outcome: "connects", words: null }],
    [nodeGraphPinKey("warmth", "input", "base", null), { outcome: "connects_with_free_conversion", words: null }],
    [nodeGraphPinKey("warmth", "input", "count", null), { outcome: "connects_through_convert_node", words: "Connects through a Tensor To Texture node" }],
    [nodeGraphPinKey("tally", "input", "picture", null), { outcome: "refused", words: "cannot link `beat.count` (Integer) to `tally.picture` (Texture): a Integer output does not connect to a Texture input", takes_the_wire_though_refused: false }],
    [nodeGraphPinKey("warmth", "input", "level", null), { outcome: "not_checked", words: "the link closes a loop of function nodes no `PreviousValue` node is in, which `connect` closes through a `PreviousValue` node it adds" }],
  ]);
});

test("a question the runtime refused, or that was not asked, lights and dims nothing, and lists every node type for a loose wire", () => {
  const refused: LinkCandidatesChecking = { kind: "not_checked", because: "check_link_candidates failed: the link is inside a placed stream" };
  expect(wireFitsOfTheAnswer(EDITED, BEAT_COUNT, refused).size).toBe(0);
  expect(portsALooseWireFits(refused)).toBeNull();
});

test("a loose wire fits each node type the runtime did not refuse, by the first port of it the runtime answered", () => {
  const checking = {
    kind: "checked",
    result: {
      candidates: [
        { end: { kind: "node_type_port", node_type: "nodes.beat:Beat", port: "level" }, check: { outcome: "connects_with_free_conversion" } },
        { end: { kind: "node_type_port", node_type: "nodes.beat:Beat", port: "accent_every" }, check: { outcome: "connects" } },
        { end: { kind: "node_type_port", node_type: "nodes.glow:Glow", port: "image" }, check: { outcome: "refused" } },
        { end: { kind: "node_type_port", node_type: "nodes.glow:Glow", port: "glow" }, check: { outcome: "connects_with_free_conversion" } },
        { end: { kind: "node_type_port", node_type: "nodes.frame_tally:FrameTally", port: "picture" }, check: { outcome: "refused" } },
      ],
    },
  } satisfies LinkCandidatesChecking;

  expect([...(portsALooseWireFits(checking) ?? [])]).toEqual([
    ["nodes.beat:Beat", "level"],
    ["nodes.glow:Glow", "glow"],
  ]);
});

test("a wire dragged off a member asks from the member, each member the runtime answers lights its own socket, and a loose wire places a node by a whole port alone", () => {
  expect(linkCandidatesRequestOf(EDITED, { node_id: "warmth", pin: "level", member: "low", side: "input" }, [], "placed_ports")).toEqual({
    stream: STREAM_ASSET,
    from: { input: { node: WARMTH, port: "level", member: "low" } },
    among: "placed_ports",
    include_refused: true,
  });
  const checking = {
    kind: "checked",
    result: {
      candidates: [
        { end: { kind: "placed_port", node: WARMTH, port: "level" }, check: { outcome: "connects" } },
        { end: { kind: "placed_port", node: WARMTH, port: "level", member: "low" }, check: { outcome: "connects_with_free_conversion" } },
      ],
    },
  } satisfies LinkCandidatesChecking;
  expect([...wireFitsOfTheAnswer(EDITED, BEAT_COUNT, checking)]).toEqual([
    [nodeGraphPinKey("warmth", "input", "level", null), { outcome: "connects", words: null }],
    [nodeGraphPinKey("warmth", "input", "level", "low"), { outcome: "connects_with_free_conversion", words: null }],
  ]);
  const looseWireChecking = {
    kind: "checked",
    result: {
      candidates: [
        { end: { kind: "node_type_port", node_type: "nodes.mix:Mix", port: "levels", member: "left" }, check: { outcome: "connects" } },
        { end: { kind: "node_type_port", node_type: "nodes.mix:Mix", port: "gain" }, check: { outcome: "connects" } },
      ],
    },
  } satisfies LinkCandidatesChecking;
  expect(portsALooseWireFits(looseWireChecking)).toEqual(new Map([["nodes.mix:Mix", "gain"]]));
});

test("a refused pin whose refusal suggests an edit takes the wire, so its connect is sent and refused with the fix; one suggesting a read does not", () => {
  const refusalSuggesting = (suggested_call: { operation: string; params: Record<string, unknown> }) => ({
    refusal_code: "link_needs_a_module_conversion" as const,
    action: "connect",
    refused_operation_index: 0,
    suggested_call,
    runtime_words: "To fix: place a `nodes.sweep:SweepPosition` node between them",
  });
  const placing = {
    operation: "transact",
    params: { operations: [{ operation: "add_node", stream: "every-pin-kind-main-8c1d2e", type: "nodes.sweep:SweepPosition", as: "conversion" }] },
  };
  const checking: LinkCandidatesChecking = {
    kind: "checked",
    result: {
      candidates: [
        { end: { kind: "placed_port", node: WARMTH, port: "base" }, check: { outcome: "refused", refusal: refusalSuggesting(placing) } },
        { end: { kind: "placed_port", node: TALLY, port: "picture" }, check: { outcome: "refused", refusal: refusalSuggesting({ operation: "describe_operations", params: { operations: ["connect"] } }) } },
      ],
    },
  };
  const fits = wireFitsOfTheAnswer(EDITED, BEAT_COUNT, checking);
  expect(fits.get(nodeGraphPinKey("warmth", "input", "base", null))).toEqual({ outcome: "refused", words: "To fix: place a `nodes.sweep:SweepPosition` node between them", takes_the_wire_though_refused: true });
  expect(fits.get(nodeGraphPinKey("tally", "input", "picture", null))).toEqual({ outcome: "refused", words: "To fix: place a `nodes.sweep:SweepPosition` node between them", takes_the_wire_though_refused: false });
});
