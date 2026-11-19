// The answers of `check_link_candidates` the mock replays, each a recording of the runtime's own answer for
// streamlib's sample project that declares each kind of pin (`examples/every-pin-kind`), so the canvas lights,
// dims and names a convert node from the runtime's words with `?main_graph=every_pin_kind`. The mock judges no
// pin: a question it holds a recording of is answered with that recording, and any other is refused in words,
// as a runtime that answers nothing would leave the canvas judging nothing. A question is matched on its pin and
// what it asks among, not its stream asset, which the mock names apart from the runtime.

import type { CheckLinkCandidatesRequest, LinkCandidatesCheckResult } from "../src/shared/tatolab_backend_contract";
import { describeTheContractIssues, readControlContractValue } from "../src/main/tatolab_runtime_control_operation_call";
import beatCountAmongPlacedPorts from "./recordings/every-pin-kind-link-candidates-of-the-beat-count-output-among-placed-ports.json?raw";
import beatCountAmongNodeTypePorts from "./recordings/every-pin-kind-link-candidates-of-the-beat-count-output-among-node-type-ports.json?raw";
import tallyRecordsAmongPlacedPorts from "./recordings/every-pin-kind-link-candidates-of-the-tally-records-output-among-placed-ports.json?raw";
import tallyRecordsAmongNodeTypePorts from "./recordings/every-pin-kind-link-candidates-of-the-tally-records-output-among-node-type-ports.json?raw";
import glowImageAmongPlacedPorts from "./recordings/every-pin-kind-link-candidates-of-the-glow-image-input-among-placed-ports.json?raw";
import glowImageAmongNodeTypePorts from "./recordings/every-pin-kind-link-candidates-of-the-glow-image-input-among-node-type-ports.json?raw";

/** The runtime's ids of the sample's nodes the recordings ask about, as its `graph` answered them. */
const BEAT = "2f44fe9c-94cb-4bf0-af2c-b91345adc7c9";
const TALLY = "f511b25f-7028-4320-b538-a152f38695f8";
const GLOW = "070e58f6-394d-4c38-8872-d4be5dcec5dd";

/** A question the runtime was asked, without its stream, and the response it gave. */
interface RecordedLinkCandidatesQuestion {
  readonly recording: string;
  readonly asked: Omit<CheckLinkCandidatesRequest, "stream" | "level">;
  readonly responseText: string;
}

const RECORDED_QUESTIONS: readonly RecordedLinkCandidatesQuestion[] = [
  {
    recording: "every-pin-kind-link-candidates-of-the-beat-count-output-among-placed-ports",
    asked: { from: { output: { node: BEAT, port: "count" } }, among: "placed_ports", include_refused: true },
    responseText: beatCountAmongPlacedPorts,
  },
  {
    recording: "every-pin-kind-link-candidates-of-the-beat-count-output-among-node-type-ports",
    asked: { from: { output: { node: BEAT, port: "count" } }, among: "node_type_ports" },
    responseText: beatCountAmongNodeTypePorts,
  },
  {
    recording: "every-pin-kind-link-candidates-of-the-tally-records-output-among-placed-ports",
    asked: { from: { output: { node: TALLY, port: "tally" } }, among: "placed_ports", include_refused: true },
    responseText: tallyRecordsAmongPlacedPorts,
  },
  {
    recording: "every-pin-kind-link-candidates-of-the-tally-records-output-among-node-type-ports",
    asked: { from: { output: { node: TALLY, port: "tally" } }, among: "node_type_ports" },
    responseText: tallyRecordsAmongNodeTypePorts,
  },
  {
    recording: "every-pin-kind-link-candidates-of-the-glow-image-input-among-placed-ports",
    asked: { from: { input: { node: GLOW, port: "image" } }, among: "placed_ports", include_refused: true },
    responseText: glowImageAmongPlacedPorts,
  },
  {
    recording: "every-pin-kind-link-candidates-of-the-glow-image-input-among-node-type-ports",
    asked: { from: { input: { node: GLOW, port: "image" } }, among: "node_type_ports" },
    responseText: glowImageAmongNodeTypePorts,
  },
];

/** The `result` of a recorded JSON-RPC response, read by the runtime client's checker as the contract types it; a recording that does not read fails the mock's load. */
function recordedResult(question: RecordedLinkCandidatesQuestion): LinkCandidatesCheckResult {
  const response: unknown = JSON.parse(question.responseText);
  const result = typeof response === "object" && response !== null && "result" in response ? response.result : undefined;
  const read = readControlContractValue("LinkCandidatesCheckResult", result);
  if (!read.read) throw new Error(`the recording ${question.recording} does not read: ${describeTheContractIssues(read.issues, "the answer")}`);
  return read.value;
}

const RECORDED_ANSWERS: readonly { readonly asked: RecordedLinkCandidatesQuestion["asked"]; readonly answer: LinkCandidatesCheckResult }[] = RECORDED_QUESTIONS.map((question) => ({
  asked: question.asked,
  answer: recordedResult(question),
}));

/** Whether `request` asks what `asked` asked: from the same pin, among the same candidates, with refusals or not. */
function asksTheSame(request: CheckLinkCandidatesRequest, asked: RecordedLinkCandidatesQuestion["asked"]): boolean {
  return JSON.stringify([request.from, request.among, request.include_refused === true]) === JSON.stringify([asked.from, asked.among, asked.include_refused === true]);
}

/** The runtime's recorded answer to `request`, rejecting in words for a question the mock holds no recording of. */
export function mockReplayedLinkCandidatesOf(request: CheckLinkCandidatesRequest): LinkCandidatesCheckResult {
  const recorded = RECORDED_ANSWERS.find(({ asked }) => asksTheSame(request, asked));
  if (recorded === undefined) throw "The mock holds no recorded answer of check_link_candidates for this pin.";
  return structuredClone(recorded.answer);
}
