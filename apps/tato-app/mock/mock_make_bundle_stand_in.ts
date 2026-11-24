// A stand-in, since no recording holds a Make Bundle: the every-pin-kind sample's graph
// recorded once each setting became an input, with a `tatolab.stream:MakeBundle` placed as
// `make_reading` beside it. Its ports follow what streamlib at d4ec292 declares of a placed
// Make Bundle: its `bundle_type` setting chooses among the bundles its stream declares, listed
// by name, `Reading` and `Tone`, and holds `Reading` saved unnamed, as a graph saved before
// bundles were named holds it; its `members` input and `bundle` output carry the bundle the
// setting holds, as the runtime types them from it.

import { NODE_STUDIO_FIELDS_NONE_SET } from "@tatolab/tato-app-view-sdk/studio_readings";
import type { JsonValue, PinType, StreamGraphPortPin } from "../src/shared/tatolab_backend_contract";
import { mockRecordedGraphOfTheEveryPinKindSampleWithSettingsAsInputs } from "./mock_recordings";
import type { MockGraphNode, MockGraphPort, MockStreamGraph } from "./mock_stream_fixtures";

/** The node types of the built-ins that carry the bundle their `bundle_type` setting chooses on their bundle ports. */
const NODE_TYPES_TYPED_BY_THEIR_BUNDLE_TYPE = ["tatolab.stream:MakeBundle", "tatolab.stream:BreakBundle"];

/** The setting that chooses the bundle a Make Bundle or Break Bundle carries. */
const BUNDLE_TYPE_SETTING = "bundle_type";

/** The ports of a Make Bundle and a Break Bundle that carry the bundle `bundle_type` chooses. */
const PORTS_TYPED_BY_THE_BUNDLE_TYPE = ["members", "bundle"];

const READING_MEMBERS = [
  { name: "level", member_type: { type: "float" } },
  { name: "pitch", member_type: { type: "integer" } },
] as const satisfies Extract<PinType, { type: "bundle" }>["members"];

/** The bundles the stand-in's stream declares, as the runtime lists them in `bundle_type`'s `among`. */
const MOCK_STAND_IN_BUNDLES_THE_STREAM_DECLARES: readonly PinType[] = [
  { type: "bundle", name: "Reading", members: [...READING_MEMBERS] },
  { type: "bundle", name: "Tone", members: [{ name: "hertz", member_type: { type: "float" } }] },
];

/** `Reading` as a graph saved before bundles were named holds it. */
const READING_SAVED_UNNAMED = { type: "bundle", members: READING_MEMBERS.map((member) => ({ name: member.name, member_type: { ...member.member_type } })) } satisfies PinType & JsonValue;

/** Whether `held` is a bundle, as the mock trusts the Studio to send one that the runtime would take. */
function isABundle(held: JsonValue | null): held is JsonValue & Extract<PinType, { type: "bundle" }> {
  return typeof held === "object" && held !== null && !Array.isArray(held) && held["type"] === "bundle" && Array.isArray(held["members"]);
}

/** A bundle port of `pin`, a Records port as the runtime serves one, its member reads where it is an input that takes them. */
function bundlePortOf(name: string, pin: StreamGraphPortPin | null, readsItsMembers: boolean): MockGraphPort {
  const members = pin?.pin_type.type === "bundle" ? pin.pin_type.members : [];
  return {
    name,
    family: "records",
    stream_facts: null,
    values_checked: false,
    pin,
    value_read: null,
    ...(readsItsMembers ? { member_reads: members.map((member) => ({ member: member.name, value_read: { value: null, comes_from: null }, default_value: null })) } : {}),
  };
}

/** Retypes a Make Bundle's or Break Bundle's bundle ports to the bundle its `bundle_type` holds once `input` was set, untyped while it holds none, as the runtime does; any other node or input is left as it is. */
export function retypeThePortsTheBundleTypeChooses(node: MockGraphNode, input: string): void {
  if (input !== BUNDLE_TYPE_SETTING || !NODE_TYPES_TYPED_BY_THEIR_BUNDLE_TYPE.includes(node.type)) return;
  const held = node.input_ports.find((port) => port.name === BUNDLE_TYPE_SETTING)?.value_read?.value ?? null;
  const pin: StreamGraphPortPin | null = isABundle(held) ? { pin_type: held, flow: "value" } : null;
  const retyped = (port: MockGraphPort, readsItsMembers: boolean): MockGraphPort => (PORTS_TYPED_BY_THE_BUNDLE_TYPE.includes(port.name) ? bundlePortOf(port.name, pin, readsItsMembers) : port);
  node.input_ports = node.input_ports.map((port) => retyped(port, true));
  node.output_ports = node.output_ports.map((port) => retyped(port, false));
}

function standInMakeBundle(): MockGraphNode {
  const savedPin: StreamGraphPortPin = { pin_type: READING_SAVED_UNNAMED, flow: "value" };
  return {
    name: "make_reading",
    type: "tatolab.stream:MakeBundle",
    kind: "process",
    state: "Running",
    config: {},
    pins: { [BUNDLE_TYPE_SETTING]: READING_SAVED_UNNAMED },
    input_defaults: {},
    exposed_config_fields: [],
    input_ports: [
      {
        name: BUNDLE_TYPE_SETTING,
        family: "records",
        stream_facts: null,
        values_checked: false,
        pin: { pin_type: { type: "pin_type_choice", among: [...MOCK_STAND_IN_BUNDLES_THE_STREAM_DECLARES], among_the_bundles_its_stream_declares: true }, flow: "value" },
        value_read: { value: READING_SAVED_UNNAMED, comes_from: "saved" },
        takes_a_wire: false,
      },
      { ...bundlePortOf("members", savedPin, true), takes_a_wire: true },
    ],
    output_ports: [bundlePortOf("bundle", savedPin, false)],
    studio: { ...NODE_STUDIO_FIELDS_NONE_SET },
  };
}

/** The every-pin-kind sample's graph recorded once each setting became an input, with the stand-in `make_reading` beside it. */
export function mockEveryPinKindGraphWithAStandInMakeBundle(): MockStreamGraph {
  const graph = mockRecordedGraphOfTheEveryPinKindSampleWithSettingsAsInputs();
  return { ...graph, nodes: [...graph.nodes, standInMakeBundle()] };
}
