// A view people write declares itself in `tatolab_view.json`, shipped beside its built web files in
// a Python package's `tatolab.views` entry point. This reads that declaration; the sandbox serves
// only what it grants.

import { PORT_FAMILIES, type JsonValue, type PortFamily } from "./tatolab_backend_contract.js";

/** The version of the view contract this Tato Studio serves; a view built for a later minor, or another major, is refused by name. */
export const STUDIO_VIEW_CONTRACT_SERVED = { major: 1, minor: 0 } as const;

/** Every part of the view contract a manifest may ask for beyond what every view gets. */
export const STUDIO_VIEW_CAPABILITIES = [
  "read.selection",
  "write.selection",
  "read.stream_graph",
  "read.project_assets",
  "edit.stream_graph",
  "gpu",
  "camera",
  "microphone",
] as const;

/** A part of the view contract a manifest asks for. */
export type StudioViewCapability = (typeof STUDIO_VIEW_CAPABILITIES)[number];

/** An input or output a view declares, as a node declares a port: its name and the one family it carries. */
export interface StudioViewDeclaredPort {
  name: string;
  family: PortFamily;
}

/** What a view's `tatolab_view.json` declares. */
export interface StudioViewManifest {
  contract: { major: number; minor: number };
  title: string;
  /** The icon's path inside the view's folder, or `null` for the studio's project-view icon. */
  icon_path: string | null;
  /** The HTML file the view opens on, inside its folder. */
  entry_path: string;
  /** The asset file extensions it opens, each with its dot, as `.glb`. */
  accepts_file_extensions: string[];
  inputs: StudioViewDeclaredPort[];
  outputs: StudioViewDeclaredPort[];
  capabilities: StudioViewCapability[];
  /** The hosts the view may reach, which become its frame's `connect-src`. */
  network_hosts: string[];
}

/** A view's manifest as read, or why it cannot open, in words that name the field. */
export type StudioViewManifestReading = { kind: "read"; manifest: StudioViewManifest } | { kind: "not_read"; because: string };

type JsonObject = { [key: string]: JsonValue };

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStudioViewCapability(capability: string): capability is StudioViewCapability {
  return STUDIO_VIEW_CAPABILITIES.some((knownCapability) => knownCapability === capability);
}

function isPortFamily(family: string): family is PortFamily {
  return PORT_FAMILIES.some((knownFamily) => knownFamily === family);
}

/** A path inside the view's own folder: relative, with no `..` step, no scheme and no backslash. */
function isAPathInsideTheViewsFolder(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  return path.split("/").every((step) => step !== "" && step !== "." && step !== "..");
}

const NETWORK_HOST_PATTERN = /^(?=.{1,253}(:|$))[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?$/;

type FieldReading<Value> = { kind: "read"; value: Value } | { kind: "not_read"; because: string };

function stringListField(manifestJson: JsonObject, field: string): FieldReading<string[]> {
  const fieldValue = manifestJson[field];
  if (fieldValue === undefined) return { kind: "read", value: [] };
  if (!Array.isArray(fieldValue)) return { kind: "not_read", because: `\`${field}\` is not a list.` };
  const strings: string[] = [];
  for (const entry of fieldValue) {
    if (typeof entry !== "string") return { kind: "not_read", because: `\`${field}\` lists ${JSON.stringify(entry)}, which is not a string.` };
    strings.push(entry);
  }
  return { kind: "read", value: strings };
}

function declaredPortsField(manifestJson: JsonObject, field: "inputs" | "outputs"): FieldReading<StudioViewDeclaredPort[]> {
  const fieldValue = manifestJson[field];
  if (fieldValue === undefined) return { kind: "read", value: [] };
  if (!Array.isArray(fieldValue)) return { kind: "not_read", because: `\`${field}\` is not a list.` };
  const declaredPorts: StudioViewDeclaredPort[] = [];
  for (const entry of fieldValue) {
    if (!isJsonObject(entry)) return { kind: "not_read", because: `\`${field}\` lists ${JSON.stringify(entry)}, which is not an object with a name and a family.` };
    const { name, family } = entry;
    if (typeof name !== "string" || !/^[a-z_][a-z0-9_]*$/.test(name)) {
      return { kind: "not_read", because: `\`${field}\` lists a port named ${JSON.stringify(name)}; a name is lower-case letters, digits and underscores.` };
    }
    if (declaredPorts.some((declaredPort) => declaredPort.name === name)) return { kind: "not_read", because: `\`${field}\` names \`${name}\` twice.` };
    if (typeof family !== "string" || !isPortFamily(family)) {
      return { kind: "not_read", because: `\`${name}\` carries ${JSON.stringify(family)}; a port carries one of ${PORT_FAMILIES.join(", ")}.` };
    }
    declaredPorts.push({ name, family });
  }
  return { kind: "read", value: declaredPorts };
}

function contractField(manifestJson: JsonObject): FieldReading<{ major: number; minor: number }> {
  const contract = manifestJson["contract"];
  const versionMatch = typeof contract === "string" ? /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(contract) : null;
  if (versionMatch === null) return { kind: "not_read", because: `\`contract\` is ${JSON.stringify(contract ?? null)}; it names the view contract the view was built for, as "1.0".` };
  const major = Number(versionMatch[1]);
  const minor = Number(versionMatch[2]);
  const served = `${STUDIO_VIEW_CONTRACT_SERVED.major}.${STUDIO_VIEW_CONTRACT_SERVED.minor}`;
  if (major !== STUDIO_VIEW_CONTRACT_SERVED.major || minor > STUDIO_VIEW_CONTRACT_SERVED.minor) {
    return { kind: "not_read", because: `It was built for view contract ${major}.${minor}, and this Tato Studio serves ${served}.` };
  }
  return { kind: "read", value: { major, minor } };
}

/** `manifestJson`, a view's `tatolab_view.json` as parsed, read against the contract this Tato Studio serves. */
export function readStudioViewManifest(manifestJson: JsonValue): StudioViewManifestReading {
  if (!isJsonObject(manifestJson)) return { kind: "not_read", because: "`tatolab_view.json` is not a JSON object." };
  const contract = contractField(manifestJson);
  if (contract.kind === "not_read") return contract;
  const { title, entry, icon } = manifestJson;
  if (typeof title !== "string" || title.trim() === "") return { kind: "not_read", because: "`title` is missing; it is the name the view-type menu lists." };
  if (typeof entry !== "string" || !isAPathInsideTheViewsFolder(entry)) {
    return { kind: "not_read", because: `\`entry\` is ${JSON.stringify(entry ?? null)}; it is the HTML file the view opens on, a path inside its folder.` };
  }
  if (icon !== undefined && (typeof icon !== "string" || !isAPathInsideTheViewsFolder(icon))) {
    return { kind: "not_read", because: `\`icon\` is ${JSON.stringify(icon)}; it is a path inside the view's folder.` };
  }
  const accepts = manifestJson["accepts"];
  if (accepts !== undefined && !isJsonObject(accepts)) return { kind: "not_read", because: "`accepts` is not an object." };
  const acceptedFileExtensions: FieldReading<string[]> = accepts === undefined ? { kind: "read", value: [] } : stringListField(accepts, "files");
  if (acceptedFileExtensions.kind === "not_read") return { kind: "not_read", because: `In \`accepts\`, ${acceptedFileExtensions.because}` };
  const extensionWithoutItsDot = acceptedFileExtensions.value.find((extension) => !/^\.[a-z0-9]+$/.test(extension));
  if (extensionWithoutItsDot !== undefined) return { kind: "not_read", because: `\`accepts.files\` lists "${extensionWithoutItsDot}"; an extension is lower case with its dot, as ".glb".` };
  const inputs = declaredPortsField(manifestJson, "inputs");
  if (inputs.kind === "not_read") return inputs;
  const outputs = declaredPortsField(manifestJson, "outputs");
  if (outputs.kind === "not_read") return outputs;
  const capabilityNames = stringListField(manifestJson, "capabilities");
  if (capabilityNames.kind === "not_read") return capabilityNames;
  const capabilities: StudioViewCapability[] = [];
  for (const capability of capabilityNames.value) {
    if (!isStudioViewCapability(capability)) return { kind: "not_read", because: `It asks for \`${capability}\`, which view contract ${contract.value.major}.${contract.value.minor} does not have.` };
    if (!capabilities.includes(capability)) capabilities.push(capability);
  }
  const networkHosts = stringListField(manifestJson, "network");
  if (networkHosts.kind === "not_read") return networkHosts;
  const hostOutOfShape = networkHosts.value.find((host) => !NETWORK_HOST_PATTERN.test(host));
  if (hostOutOfShape !== undefined) return { kind: "not_read", because: `\`network\` lists "${hostOutOfShape}"; a host is a lower-case name, with a port if it needs one, and no scheme or wildcard.` };
  return {
    kind: "read",
    manifest: {
      contract: contract.value,
      title: title.trim(),
      icon_path: icon ?? null,
      entry_path: entry,
      accepts_file_extensions: acceptedFileExtensions.value,
      inputs: inputs.value,
      outputs: outputs.value,
      capabilities,
      network_hosts: networkHosts.value,
    },
  };
}
