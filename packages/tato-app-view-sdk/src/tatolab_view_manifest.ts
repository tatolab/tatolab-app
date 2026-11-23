// `tatolab_view.json`, view contract 1.1: what every panel declares, Tato Studio's own or brought by a
// project. The Studio reads a manifest with the Schema of `./studio_host`, held to the types here,
// and writes `tatolab_view.schema.json` from it, less the checks only code can make (a path that
// stays inside the view's folder), which Studio still enforces.

import type { PinType } from "./pin_types.js";
import type { PortFamily } from "./port_families.js";
import type { JsonValue } from "./studio_readings.js";

/** The view contract this SDK speaks; a manifest built for a later minor, or another major, is refused by name. */
export const VIEW_CONTRACT_SERVED = { major: 1, minor: 1 } as const;

/** The first minor of the served major in which a declared port names its `pin_type`. */
export const VIEW_CONTRACT_MINOR_OF_A_PORTS_PIN_TYPE = 1;

/** What a view may declare it uses. Every view runs with full access whatever it declares; `camera` and `microphone` are what its frame may ask the person for, through the system's own prompt. */
export const VIEW_CAPABILITIES = [
  "read.selection",
  "write.selection",
  "read.stream_graph",
  "read.project_assets",
  "write.project_assets",
  "edit.stream_graph",
  "gpu",
  "camera",
  "microphone",
] as const;

/** A part of the view contract a manifest declares it uses. */
export type ViewCapability = (typeof VIEW_CAPABILITIES)[number];

/** Where a view shows: `area`, a panel with no node, opened from any area; `node`, a panel shown on a node of its type, reading that node's inputs and writing its outputs. */
export type ViewPlacement = "area" | "node";

/** A path inside the view's own folder: relative, with no `..` step, no scheme and no backslash. */
export function isAPathInsideTheViewsFolder(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  return path.split("/").every((step) => step !== "" && step !== "." && step !== "..");
}

/** The families of the outputs a panel writes: each value of one is set on the view node's input of the output's name, and published on the output. */
export const FAMILIES_A_PANEL_WRITES: readonly PortFamily[] = ["array", "channels", "records"];

/** An input or output a `node` view declares, as a node declares a port: by its pin type. */
export type ViewDeclaredPort = {
  /** Lower-case letters, digits and underscores, named once among the view's ports. */
  name: string;
  /** The one family the messages of the port's pin type belong to, read from it. */
  family: PortFamily;
  /** The pin type the port carries. */
  pin_type: PinType;
  description?: string | undefined;
  /** The lowest and highest value an Array port carries, for a control such as a fader, lowest first. */
  range?: [number, number] | undefined;
};

/** The JSON Schema of what a view's area remembers: an object whose every property gives its `default`, which fits the property's own schema; any other JSON Schema keyword is kept as written. */
export type ViewSettingsDeclaration = {
  type: "object";
  properties: { [settingName: string]: { default: JsonValue; [keyword: string]: unknown } };
  additionalProperties?: boolean | undefined;
  [keyword: string]: unknown;
};

/** What `tatolab_view.json` declares, for view contract 1.1, defaults filled in. A view's id is never written here: one Tato Studio ships with is its folder's name, a project's view's its project's name and its folder's. */
export type TatolabViewManifest = {
  /** The view contract the view was built for, as `"1.1"`. */
  contract: string;
  /** The name the view-type menu lists. */
  title: string;
  description?: string | undefined;
  /** An SVG or PNG inside the view's folder; left out, Studio shows its view icon. */
  icon?: string | undefined;
  /** A picture of the view inside its folder, for a listing of views. */
  preview?: string | undefined;
  /** The HTML file the view's frame opens on, inside its folder. */
  entry: string;
  placement: ViewPlacement;
  inputs: ViewDeclaredPort[];
  outputs: ViewDeclaredPort[];
  /** The files the view opens, by extension, lower case with its dot, as `".glb"`. */
  accepts: { files: string[] };
  settings?: ViewSettingsDeclaration | undefined;
  /** What the view declares it uses, each once; a camera or microphone left out is refused to its frame. */
  capabilities: ViewCapability[];
};

/** A view's manifest as read, or why it cannot open, in words naming the field. */
export type TatolabViewManifestReading = { kind: "read"; manifest: TatolabViewManifest } | { kind: "not_read"; because: string };
