// Reading `tatolab_view.json`, an author's file, against view contract 1.1, and the JSON Schema an
// author's editor checks it against, written from the same Schema.

import { controlContractIssues } from "@tatolab/runtime-client/contract";
import { Effect, Result, Schema, SchemaIssue, SchemaRepresentation, SchemaTransformation } from "effect";
import { BUILT_IN_PIN_TYPES } from "../built_in_pin_types.js";
import { isAPinType } from "../pin_model/pin_type_check.js";
import type { BuiltInPinTypeName } from "../pin_types.js";
import { familyCarryingAWholeValueOf, PORT_FAMILIES, portFamilyWords } from "../port_families.js";
import {
  FAMILIES_A_PANEL_WRITES,
  isAPathInsideTheViewsFolder,
  VIEW_CAPABILITIES,
  VIEW_CONTRACT_MINOR_OF_A_PORTS_PIN_TYPE,
  VIEW_CONTRACT_SERVED,
  type TatolabViewManifest,
  type TatolabViewManifestReading,
  type ViewDeclaredPort,
  type ViewSettingsDeclaration,
} from "../tatolab_view_manifest.js";
import { contractComponentJsonSchemaDefinitions } from "./contract_value.js";
import { issuesAtTheirPaths, type IssueAtItsPath } from "./schema_issue_words.js";
import { schemaOfThePublicType } from "./schema_of_a_public_type.js";
import { jsonValueSchema } from "./studio_reading_schemas.js";

/** `schema` for a key that may be left out, taking `leftOut` then, which the JSON Schema names as its default. */
function takingWhenLeftOut<FieldSchema extends Schema.Top>(schema: FieldSchema, leftOut: FieldSchema["Type"] & FieldSchema["Encoded"]) {
  return schema.annotate({ default: leftOut }).pipe(Schema.withDecodingDefaultKey(Effect.succeed(leftOut)));
}

// A pattern carries the Unicode flag, which is what lets the JSON Schema carry it too.

const pathInsideTheViewsFolderSchema = Schema.NonEmptyString.check(
  Schema.makeFilter(isAPathInsideTheViewsFolder, { message: "it is a path inside the view's folder, with no `..` step, scheme or backslash" }),
);

/** The major and minor `contract` names, a `major.minor`. */
function majorAndMinorOf(contract: string): { major: number | undefined; minor: number | undefined } {
  const [major, minor] = contract.split(".").map(Number);
  return { major, minor };
}

/** Whether `contract`, a `major.minor`, is one this SDK serves: its major, at its minor or an earlier one. */
function isAContractServed(contract: string): boolean {
  const { major, minor } = majorAndMinorOf(contract);
  return major === VIEW_CONTRACT_SERVED.major && minor !== undefined && minor <= VIEW_CONTRACT_SERVED.minor;
}

/** Whether `contract`, one this SDK serves, is one in which a declared port names its `pin_type`. */
function namesAMinorWithAPortsPinType(contract: string): boolean {
  const { minor } = majorAndMinorOf(contract);
  return minor !== undefined && minor >= VIEW_CONTRACT_MINOR_OF_A_PORTS_PIN_TYPE;
}

const contractSchema = Schema.String.check(
  Schema.isPattern(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u, { message: 'it names the view contract the view was built for, as "1.0"' }),
  Schema.makeFilter(isAContractServed, { message: `this Tato Studio serves view contract ${VIEW_CONTRACT_SERVED.major}.${VIEW_CONTRACT_SERVED.minor}` }),
);

const portNameSchema = Schema.String.check(Schema.isPattern(/^[a-z_][a-z0-9_]*$/u, { message: "a port name is lower-case letters, digits and underscores" }));

const rangeSchema = Schema.mutable(Schema.Tuple([Schema.Finite, Schema.Finite])).check(
  Schema.makeFilter(([lowest, highest]) => lowest < highest, { message: "a range is [lowest, highest], lowest first" }),
);

const BUILT_IN_PIN_TYPE_NAMES: ReadonlyMap<string, BuiltInPinTypeName> = new Map(BUILT_IN_PIN_TYPES.map(({ name }) => [name, name]));

/** Why `written` is no pin type the runtime takes: its `type` names no built-in type, or the first issue the runtime client's check of the contract's `PinType` gives, at its place. */
function whyItIsNoPinType(written: { readonly [key: string]: unknown }): Schema.FilterIssue | undefined {
  const typeName = written["type"];
  if (typeof typeName !== "string" || !BUILT_IN_PIN_TYPE_NAMES.has(typeName)) {
    return { path: ["type"], issue: `a pin type's \`type\` is one of ${BUILT_IN_PIN_TYPES.map(({ name }) => `\`${name}\``).join(", ")}` };
  }
  const [firstIssue] = controlContractIssues("PinType", written, "sent");
  return firstIssue === undefined ? undefined : { path: firstIssue.path, issue: firstIssue.message };
}

const PIN_TYPE_DEFINITION = "#/$defs/PinType";

/**
 * A pin type as the control contract writes it, checked by the runtime client's check of it, and in the JSON Schema a
 * reference to the contract's own `PinType`, which `tatolabViewJsonSchema` places in its `$defs`.
 */
const pinTypeSchema = Schema.Record(Schema.String, Schema.Unknown).pipe(
  Schema.check(Schema.makeFilter(whyItIsNoPinType, { toJsonSchema: () => ({}) }, true)),
  Schema.refine(isAPinType, { toJsonSchema: () => ({ $ref: PIN_TYPE_DEFINITION }) }),
);

const portFamilySchema = Schema.Literals(PORT_FAMILIES);

/** A declared port as `tatolab_view.json` writes it: its `pin_type`, its `family`, or both, in agreement. */
const viewDeclaredPortAsWrittenSchema = Schema.Struct({
  name: portNameSchema,
  family: Schema.optionalKey(portFamilySchema),
  pin_type: Schema.optionalKey(pinTypeSchema),
  description: Schema.optionalKey(Schema.String),
  range: Schema.optionalKey(rangeSchema),
}).check(
  Schema.makeFilter((port) => (port.family === undefined && port.pin_type === undefined ? "a port names the `pin_type` it carries, or the older `family`" : undefined), {
    toJsonSchema: () => ({ anyOf: [{ required: ["pin_type"] }, { required: ["family"] }] }),
  }),
);

/** A declared port as read: the family it carries, the one its pin type's messages belong to when it names one. */
const viewDeclaredPortReadSchema = Schema.Struct({
  name: Schema.String,
  family: portFamilySchema,
  pin_type: Schema.optionalKey(Schema.toType(pinTypeSchema)),
  description: Schema.optionalKey(Schema.String),
  range: Schema.optionalKey(Schema.mutable(Schema.Tuple([Schema.Finite, Schema.Finite]))),
});

type ViewDeclaredPortAsWritten = (typeof viewDeclaredPortAsWrittenSchema)["Type"];

type ViewDeclaredPortRead = (typeof viewDeclaredPortReadSchema)["Type"];

/** `written` read: the family its pin type is carried as, which a `family` written beside it agrees with, or the `family` it names alone. */
function viewDeclaredPortRead(written: ViewDeclaredPortAsWritten): Effect.Effect<ViewDeclaredPortRead, SchemaIssue.Issue> {
  const { family, pin_type, ...rest } = written;
  if (pin_type === undefined) {
    return family === undefined ? Effect.fail(new SchemaIssue.InvalidValue({ message: "a port names the `pin_type` it carries, or the older `family`" }, written)) : Effect.succeed({ ...rest, family });
  }
  const carried = familyCarryingAWholeValueOf(pin_type);
  if (carried === null) {
    return Effect.fail(new SchemaIssue.InvalidValue({ message: `\`pin_type\`: a ${pin_type.type} rides no message a view's port reads or writes; a view declares a port of a type a link carries` }, written));
  }
  if (family !== undefined && family !== carried) {
    return Effect.fail(new SchemaIssue.InvalidValue({ message: `\`family\` is \`${family}\`, and a ${pin_type.type} is carried as \`${carried}\`; drop \`family\`, which the \`pin_type\` sets` }, written));
  }
  return Effect.succeed({ ...rest, family: carried, pin_type });
}

const viewDeclaredPortSchema = viewDeclaredPortAsWrittenSchema.pipe(
  Schema.decodeTo(
    viewDeclaredPortReadSchema,
    SchemaTransformation.transformEffect<ViewDeclaredPortRead, ViewDeclaredPortAsWritten>({ decode: viewDeclaredPortRead, encode: (port) => Effect.succeed(port) }),
  ),
);

/** Ports named once, a range carried by an Array port alone, each issue at its port. */
function portsNamedOnce(ports: readonly ViewDeclaredPort[]): Schema.FilterIssue[] {
  const namesSeen = new Set<string>();
  return ports.flatMap((port, index): Schema.FilterIssue[] => {
    const named = namesSeen.has(port.name) ? [{ path: [index, "name"], issue: `\`${port.name}\` is named twice` }] : [];
    namesSeen.add(port.name);
    const ranged = port.range !== undefined && port.family !== "array" ? [{ path: [index, "range"], issue: "only an Array port carries a range" }] : [];
    return [...named, ...ranged];
  });
}

const declaredPortsSchema = takingWhenLeftOut(Schema.mutable(Schema.Array(viewDeclaredPortSchema)), []).check(Schema.makeFilter(portsNamedOnce));

const fileExtensionSchema = Schema.String.check(Schema.isPattern(/^\.[a-z0-9]+$/u, { message: 'an extension is lower case with its dot, as ".glb"' }));

/** The JSON Schema keywords of an object a settings declaration keeps as written. */
const keywordsKeptAsWritten = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/** A settings declaration that Studio can check settings against, whose defaults fit it, each issue at its default. */
function settingsDeclarationCheckable(declaration: ViewSettingsDeclaration): Schema.FilterIssue[] {
  const settingsCheck = settingsCheckOfTheDeclaration(declaration);
  if (settingsCheck.kind === "not_a_schema") return [`it is not JSON Schema Studio can check settings against: ${settingsCheck.because}`];
  const defaults = Object.fromEntries(Object.entries(declaration.properties).map(([settingName, property]) => [settingName, property.default]));
  const checked = settingsCheck.check(defaults);
  return checked.kind === "fits" ? [] : checked.issues.map(({ path, words }) => ({ path: ["properties", ...path, "default"], issue: `its default does not fit its own schema: ${words}` }));
}

const viewSettingsDeclarationSchema = schemaOfThePublicType<ViewSettingsDeclaration>()(
  Schema.StructWithRest(
    Schema.Struct({
      type: Schema.Literal("object"),
      properties: Schema.Record(Schema.String, Schema.StructWithRest(Schema.Struct({ default: jsonValueSchema }), keywordsKeptAsWritten)),
      additionalProperties: Schema.optionalKey(Schema.Boolean),
    }),
    keywordsKeptAsWritten,
  ).check(Schema.makeFilter(settingsDeclarationCheckable)),
);

/** An output named apart from the view's inputs, and an output a panel writes apart from its settings too, its value being set on the view node's input of the output's name. */
function outputsNamedApartFromItsInputsAndSettings(manifest: Pick<TatolabViewManifest, "inputs" | "outputs" | "settings">): Schema.FilterIssue[] {
  const inputNames = new Set(manifest.inputs.map((input) => input.name));
  const settingNames = new Set(Object.keys(manifest.settings?.properties ?? {}));
  return manifest.outputs.flatMap(({ name, family }, index): Schema.FilterIssue[] => {
    const path = ["outputs", index, "name"];
    if (inputNames.has(name)) return [{ path, issue: `\`${name}\` names an input too, and a port is named once` }];
    if (FAMILIES_A_PANEL_WRITES.includes(family) && settingNames.has(name)) {
      return [
        {
          path,
          issue: `\`${name}\` names a setting too, and the value of an output a panel writes is set on the view node's input of the output's name, so such an output is named after no setting`,
        },
      ];
    }
    return [];
  });
}

/** The pin types of a panel's outputs that hold no stored value but whose samples a panel still writes as values. */
const PIN_TYPES_A_PANEL_WRITES_WITH_NO_STORED_VALUE: ReadonlySet<BuiltInPinTypeName> = new Set(["audio", "tensor"]);

/** Whether a panel writes values of the type `typeName` onto an output: one a pin of it holds, or the samples of an Audio or Tensor stream. */
function isATypeAPanelWritesAValueOf(typeName: BuiltInPinTypeName): boolean {
  return PIN_TYPES_A_PANEL_WRITES_WITH_NO_STORED_VALUE.has(typeName) || BUILT_IN_PIN_TYPES.some(({ name, value_component }) => name === typeName && value_component !== undefined);
}

/** A port names its `pin_type` only in a view built for the minor that brought it, and an output a panel writes is of a type that holds a value. */
function pinTypesNamedWhereTheyMayBe(manifest: Pick<TatolabViewManifest, "contract" | "inputs" | "outputs">): Schema.FilterIssue[] {
  const minor = `${VIEW_CONTRACT_SERVED.major}.${VIEW_CONTRACT_MINOR_OF_A_PORTS_PIN_TYPE}`;
  const namedTooEarly = namesAMinorWithAPortsPinType(manifest.contract)
    ? []
    : (["inputs", "outputs"] as const).flatMap((direction) =>
        manifest[direction].flatMap((port, index): Schema.FilterIssue[] =>
          port.pin_type === undefined ? [] : [{ path: [direction, index, "pin_type"], issue: `a port's \`pin_type\` is view contract ${minor}; write \`"contract": "${minor}"\`` }],
        ),
      );
  const holdingNoValue = manifest.outputs.flatMap(({ family, pin_type }, index): Schema.FilterIssue[] =>
    pin_type !== undefined && FAMILIES_A_PANEL_WRITES.includes(family) && !isATypeAPanelWritesAValueOf(pin_type.type)
      ? [{ path: ["outputs", index, "pin_type"], issue: `a panel writes a value onto a ${portFamilyWords(family)} output, and a ${pin_type.type} holds none` }]
      : [],
  );
  return [...namedTooEarly, ...holdingNoValue];
}

/** A view with ports shows on a node, and its outputs are named apart. */
function placedForItsPortsAndNamedApart(manifest: Pick<TatolabViewManifest, "placement" | "inputs" | "outputs" | "settings">): Schema.FilterIssue[] {
  const placement: Schema.FilterIssue[] =
    manifest.placement === "area" && (manifest.inputs.length > 0 || manifest.outputs.length > 0)
      ? [{ path: ["placement"], issue: "an `area` view has no node, so it declares no inputs or outputs; a view with ports has `node` placement" }]
      : [];
  return [...placement, ...outputsNamedApartFromItsInputsAndSettings(manifest)];
}

const TITLE_LEFT_BLANK = "it is the name the view-type menu lists";

/** A title, written with at least one character and read trimmed, which leaves something. */
const titleSchema = Schema.String.check(Schema.isMinLength(1, { message: TITLE_LEFT_BLANK })).pipe(
  Schema.decodeTo(Schema.String.check(Schema.isNonEmpty({ message: TITLE_LEFT_BLANK })), SchemaTransformation.trim()),
);

const tatolabViewManifestSchema = Schema.Struct({
  contract: contractSchema,
  title: titleSchema,
  description: Schema.optionalKey(Schema.String),
  icon: Schema.optionalKey(pathInsideTheViewsFolderSchema),
  preview: Schema.optionalKey(pathInsideTheViewsFolderSchema),
  entry: pathInsideTheViewsFolderSchema,
  placement: Schema.Literals(["area", "node"]),
  inputs: declaredPortsSchema,
  outputs: declaredPortsSchema,
  accepts: takingWhenLeftOut(Schema.Struct({ files: takingWhenLeftOut(Schema.mutable(Schema.Array(fileExtensionSchema)), []) }), { files: [] }),
  settings: Schema.optionalKey(viewSettingsDeclarationSchema),
  capabilities: takingWhenLeftOut(Schema.mutable(Schema.Array(Schema.Literals(VIEW_CAPABILITIES))), []),
}).check(Schema.makeFilter(placedForItsPortsAndNamedApart), Schema.makeFilter(pinTypesNamedWhereTheyMayBe));

/** What `tatolab_view.json` declares, read as the public manifest type, defaults filled in; a capability may be declared more than once. */
const tatolabViewManifestDecoding = schemaOfThePublicType<TatolabViewManifest>()(tatolabViewManifestSchema);

/** A key `tatolab_view.json` does not name is refused, at any depth but where a settings declaration keeps JSON Schema keywords as written. */
const MANIFEST_PARSE_OPTIONS = { onExcessProperty: "error", errors: "all" } as const;

function fieldPathWords(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "`tatolab_view.json`";
  return `\`${path.map((step, index) => (typeof step === "number" ? `[${step}]` : `${index === 0 ? "" : "."}${String(step)}`)).join("")}\``;
}

/** `manifestJson`, a view's `tatolab_view.json` as parsed, read against the contract this SDK speaks. */
export function readTatolabViewManifest(manifestJson: unknown): TatolabViewManifestReading {
  const decoded = Schema.decodeUnknownResult(tatolabViewManifestDecoding, MANIFEST_PARSE_OPTIONS)(manifestJson);
  if (Result.isSuccess(decoded)) return { kind: "read", manifest: { ...decoded.success, capabilities: [...new Set(decoded.success.capabilities)] } };
  const because = issuesAtTheirPaths(decoded.failure.issue)
    .map(({ path, words }) => `${fieldPathWords(path)}: ${words}.`)
    .join(" ");
  return { kind: "not_read", because };
}

/** The JSON Schema authors' editors check `tatolab_view.json` against, written from the Schema that reads it. */
export function tatolabViewJsonSchema(): Record<string, unknown> {
  const { schema, definitions } = Schema.toJsonSchemaDocument(tatolabViewManifestSchema, { onExcessProperty: "error" });
  return {
    title: `tatolab_view.json, view contract ${VIEW_CONTRACT_SERVED.major}.${VIEW_CONTRACT_SERVED.minor}`,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...schema,
    $defs: { ...definitions, ...contractComponentJsonSchemaDefinitions("PinType") },
  };
}

/** Settings checked against a declaration's JSON Schema: they fit, as read, or each issue at its path. */
export type SettingsCheckOutcome = { kind: "fits"; settings: unknown } | { kind: "does_not_fit"; issues: IssueAtItsPath[] };

/** A settings declaration's JSON Schema as a check, or why Studio cannot check settings against it. */
export type SettingsCheckOfADeclaration = { kind: "check"; check: (settings: unknown) => SettingsCheckOutcome } | { kind: "not_a_schema"; because: string };

/**
 * `declaration`, a view's settings JSON Schema, as a check of settings against it: a key it leaves out of an object
 * whose `additionalProperties` is `false` does not fit. A `pattern` is applied, as the view's own code runs with full
 * access in any case.
 */
export function settingsCheckOfTheDeclaration(declaration: ViewSettingsDeclaration): SettingsCheckOfADeclaration {
  const imported = Result.try(() => SchemaRepresentation.fromJsonSchemaDocument({ dialect: "draft-2020-12", schema: declaration, definitions: {} }, { patterns: "apply" }));
  if (Result.isFailure(imported)) return { kind: "not_a_schema", because: imported.failure instanceof Error ? imported.failure.message : String(imported.failure) };
  const decodeSettings = Schema.decodeUnknownResult(Schema.toType(imported.success), { onExcessProperty: "error", errors: "all" });
  return {
    kind: "check",
    check: (settings) => {
      const decoded = decodeSettings(settings);
      return Result.isSuccess(decoded) ? { kind: "fits", settings: decoded.success } : { kind: "does_not_fit", issues: issuesAtTheirPaths(decoded.failure.issue) };
    },
  };
}
