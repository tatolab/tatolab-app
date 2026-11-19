// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Connection, FinalConnectionState } from "@xyflow/react";
import { afterEach, expect, test, vi } from "vitest";
import { nodeGraphPinKey, type NodeGraphCanvasEditing, type NodeGraphWireFits } from "./node_graph_canvas_contract";
import { useNodeGraphWiring } from "./use_node_graph_wiring";

afterEach(cleanup);

/** A wire let go as React Flow reports one it holds no connection for, so nothing is placed for it. */
const LET_GO: FinalConnectionState = { isValid: null, from: null, fromHandle: null, fromPosition: null, fromNode: null, to: null, toHandle: null, toPosition: null, toNode: null, pointer: null };
const MOUSE_UP = new MouseEvent("mouseup");

/** The wiring over an editing whose `fitsOfAWireFrom` answers only when the test says, each answer resolving the drag it was asked for. */
function wiringAnsweredByTheTest() {
  const answers: ((fits: NodeGraphWireFits) => void)[] = [];
  const fitsOfAWireFrom = vi.fn(() => new Promise<NodeGraphWireFits>((resolve) => answers.push(resolve)));
  const applied = async () => "applied" as const;
  const editing: NodeGraphCanvasEditing = {
    onCardsMoved: applied,
    fitsOfAWireFrom,
    onPinsWired: vi.fn(),
    onWireLetGoOverTheCanvas: vi.fn(),
    onNodeAskedFor: vi.fn(),
    onNoteAskedFor: vi.fn(),
    onDeleted: vi.fn(),
    onFrameAskedFor: applied,
    onSubgraphAskedFor: vi.fn(),
    onFrameChanged: vi.fn(),
    onFrameRemoved: vi.fn(),
    onCardCollapsed: vi.fn(),
    onNoteChanged: applied,
  };
  const canvasPointOf = (point: { x: number; y: number }) => ({ on_the_canvas: point, in_the_element: point });
  const { result } = renderHook(() => useNodeGraphWiring(editing, canvasPointOf));
  return { result, answers, fitsOfAWireFrom };
}

const connection = (source: [string, string], target: [string, string]): Connection => ({ source: source[0], sourceHandle: `output:${source[1]}`, target: target[0], targetHandle: `input:${target[1]}` });

const FITS_OF_THE_PATTERN_OUTPUT: NodeGraphWireFits = new Map([
  [nodeGraphPinKey("blur", "input", "video_in"), { outcome: "connects", words: null }],
  [nodeGraphPinKey("blur", "input", "gain"), { outcome: "refused", words: "cannot link pattern.video (Image) to blur.gain (Channels)" }],
]);

test("a wire dragged off a pin asks once how it fits, judges nothing until the answer arrives, then refuses only the pins the answer refuses", async () => {
  const { result, answers, fitsOfAWireFrom } = wiringAnsweredByTheTest();

  act(() => result.current.askHowTheWireFits(MOUSE_UP, { nodeId: "pattern", handleId: "output:video", handleType: "source" }));
  expect(fitsOfAWireFrom).toHaveBeenCalledWith({ node_id: "pattern", side: "output", pin: "video" });
  expect(result.current.wireFits).toBeNull();
  expect(result.current.canTheConnectionBeWired(connection(["pattern", "video"], ["blur", "gain"]))).toBe(true);

  await act(async () => answers[0]?.(FITS_OF_THE_PATTERN_OUTPUT));
  expect(result.current.wireFits).toBe(FITS_OF_THE_PATTERN_OUTPUT);
  expect(result.current.canTheConnectionBeWired(connection(["pattern", "video"], ["blur", "gain"]))).toBe(false);
  expect(result.current.canTheConnectionBeWired(connection(["pattern", "video"], ["blur", "video_in"]))).toBe(true);
  expect(result.current.canTheConnectionBeWired(connection(["pattern", "video"], ["tally", "picture"]))).toBe(true);

  act(() => result.current.followTheWireLetGo(MOUSE_UP, LET_GO));
  expect(result.current.wireFits).toBeNull();
  expect(result.current.canTheConnectionBeWired(connection(["pattern", "video"], ["blur", "gain"]))).toBe(true);
  expect(fitsOfAWireFrom).toHaveBeenCalledTimes(1);
});

test("a wire dragged off an input is judged by the output at its other end", async () => {
  const { result, answers } = wiringAnsweredByTheTest();

  act(() => result.current.askHowTheWireFits(MOUSE_UP, { nodeId: "glow", handleId: "input:image", handleType: "target" }));
  await act(async () => answers[0]?.(new Map([[nodeGraphPinKey("tally", "output", "tally"), { outcome: "refused", words: "a link joins two ports of one family" }]])));

  expect(result.current.canTheConnectionBeWired(connection(["tally", "tally"], ["glow", "image"]))).toBe(false);
  expect(result.current.canTheConnectionBeWired(connection(["glow", "result"], ["glow", "image"]))).toBe(true);
});

test("an answer that arrives after its wire is let go is dropped, and a later drag's answer is kept", async () => {
  const { result, answers } = wiringAnsweredByTheTest();

  act(() => result.current.askHowTheWireFits(MOUSE_UP, { nodeId: "pattern", handleId: "output:video", handleType: "source" }));
  act(() => result.current.followTheWireLetGo(MOUSE_UP, LET_GO));
  act(() => result.current.askHowTheWireFits(MOUSE_UP, { nodeId: "pattern", handleId: "output:video", handleType: "source" }));
  await act(async () => answers[0]?.(FITS_OF_THE_PATTERN_OUTPUT));
  expect(result.current.wireFits).toBeNull();

  const fitsOfTheSecondDrag: NodeGraphWireFits = new Map();
  await act(async () => answers[1]?.(fitsOfTheSecondDrag));
  expect(result.current.wireFits).toBe(fitsOfTheSecondDrag);
});
