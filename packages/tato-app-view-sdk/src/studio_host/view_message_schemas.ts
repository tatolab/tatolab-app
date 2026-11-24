// What a view sends Studio over its MessagePort, decoded where it crosses into the window: a view is
// an author's code. A payload beside an ask is not walked here; the ask it rides decides what it is.

import { Effect, Schema } from "effect";
import type { MessageFromTheView, ModulesAndMarketplaceSection, ProjectAssetPick, ViewAsk, ViewOpeningTarget, ViewWatchedSubject } from "../view_wire_messages.js";
import { contractValue } from "./contract_value.js";
import { schemaOfThePublicType } from "./schema_of_a_public_type.js";
import { jsonValueSchema, portViewerTargetSchema, projectStreamsRecoverySchema, projectTransactionAuthorSchema, streamTabAddressSchema, studioSelectionSchema } from "./studio_reading_schemas.js";

const watchOrAskIdSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** A section of the Modules and Marketplace window. */
export const modulesAndMarketplaceSectionSchema = schemaOfThePublicType<ModulesAndMarketplaceSection>()(Schema.Literals(["added_to_this_project", "marketplace"]));

/** A project asset being chosen in Studio's asset picker. */
export const projectAssetPickSchema = schemaOfThePublicType<ProjectAssetPick>()(
  Schema.Struct({ media: Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))), chosen_now: Schema.NullOr(Schema.String) }),
);

/** A subject a view watches named by nothing but its kind. */
const subjectOfKind = <Kind extends string>(kind: Kind) => Schema.Struct({ kind: Schema.Literal(kind) });

/** What a view may watch. */
export const viewWatchedSubjectSchema = schemaOfThePublicType<ViewWatchedSubject>()(
  Schema.Union([
    subjectOfKind("open_project"),
    subjectOfKind("listed_streams"),
    subjectOfKind("active_stream_tab"),
    subjectOfKind("selection"),
    Schema.Struct({ kind: Schema.Literal("stream_graph"), stream: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("input_values"), stream: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("project_log"), project_folder: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("node_types"), project_folder: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("project_assets"), project_folder: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("project_transactions"), project_folder: Schema.String }),
    subjectOfKind("studio_views"),
    subjectOfKind("node_ui_elements"),
    Schema.Struct({ kind: Schema.Literal("port_viewer"), target: portViewerTargetSchema }),
    Schema.Struct({ kind: Schema.Literal("input"), input: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("python_language_server"), project_folder: Schema.String }),
    subjectOfKind("settings"),
    subjectOfKind("opened_on"),
    subjectOfKind("header_row"),
    subjectOfKind("area_expansion"),
    Schema.Struct({ kind: Schema.Literal("areas_for_the_view_type"), view_type_id: Schema.String }),
    subjectOfKind("project_asset_pick"),
  ]),
);

/** What a view of some type is opened on: a file, at a line counted from 1 when one is named, or a port. */
export const viewOpeningTargetSchema = schemaOfThePublicType<ViewOpeningTarget>()(
  Schema.Union([
    Schema.Struct({ kind: Schema.Literal("file"), file: Schema.String, line: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))) }),
    Schema.Struct({ kind: Schema.Literal("port"), target: portViewerTargetSchema }),
  ]),
);

/** What a view may ask Studio to do; the graph actions of a transaction are the control contract's, at least one. */
export const viewAskSchema = schemaOfThePublicType<ViewAsk>()(
  Schema.Union([
    Schema.Struct({ kind: Schema.Literal("select"), selection: studioSelectionSchema }),
    Schema.Struct({ kind: Schema.Literal("open_stream_tab"), stream_tab: streamTabAddressSchema }),
    Schema.Struct({ kind: Schema.Literal("open_view"), view_type_id: Schema.String, on: viewOpeningTargetSchema }),
    Schema.Struct({ kind: Schema.Literal("remember_settings"), settings: jsonValueSchema }),
    Schema.Struct({ kind: Schema.Literal("read_project_file"), file: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("save_project_file"), file: Schema.String, text: Schema.String, based_on_version: Schema.NullOr(Schema.String) }),
    Schema.Struct({ kind: Schema.Literal("create_node_file"), file: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("check_project_file"), file: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("list_project_files"), project_folder: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("send_to_python_language_server"), watch_id: watchOrAskIdSchema, message: jsonValueSchema }),
    Schema.Struct({ kind: Schema.Literal("send_output"), output: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("undo_in_the_project"), project_folder: Schema.String, author: projectTransactionAuthorSchema }),
    Schema.Struct({ kind: Schema.Literal("redo_in_the_project"), project_folder: Schema.String, author: projectTransactionAuthorSchema }),
    Schema.Struct({
      kind: Schema.Literal("transact_in_the_project"),
      project_folder: Schema.String,
      operations: Schema.mutable(Schema.Array(contractValue("StreamGraphAction"))).check(Schema.isNonEmpty()),
      mode: contractValue("GraphEditMode"),
      idempotency_key: Schema.NullOr(Schema.String),
    }),
    Schema.Struct({ kind: Schema.Literal("check_link_candidates"), project_folder: Schema.String, request: contractValue("CheckLinkCandidatesRequest") }),
    Schema.Struct({ kind: Schema.Literal("read_the_person_editing") }),
    Schema.Struct({
      kind: Schema.Literal("import_assets_into_the_project"),
      project_folder: Schema.String,
      media: Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
    }),
    Schema.Struct({ kind: Schema.Literal("relocate_asset_in_the_project"), project_folder: Schema.String, asset: Schema.String, to_path: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("read_asset_preview_in_the_project"), project_folder: Schema.String, asset: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("delete_asset_from_the_project"), project_folder: Schema.String, asset: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("list_audio_capture_devices") }),
    Schema.Struct({ kind: Schema.Literal("set_node_type_group_in_the_project"), project_folder: Schema.String, node_type: Schema.String, group: Schema.NullOr(Schema.String) }),
    Schema.Struct({ kind: Schema.Literal("recover_the_projects_streams"), project_folder: Schema.String, recovery: projectStreamsRecoverySchema }),
    Schema.Struct({ kind: Schema.Literal("show_view_type_in_area"), view_type_id: Schema.String, area_id: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("open_modules_and_marketplace"), shows: modulesAndMarketplaceSectionSchema, page: Schema.optional(Schema.String) }),
    Schema.Struct({ kind: Schema.Literal("read_the_marketplace") }),
    Schema.Struct({ kind: Schema.Literal("add_from_the_marketplace"), name: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("pick_a_project_asset"), pick: projectAssetPickSchema }),
    Schema.Struct({ kind: Schema.Literal("answer_the_project_asset_pick"), asset: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("expand_the_area"), is_expanded: Schema.Boolean }),
  ]),
);

/** One message a view sends Studio. */
export const messageFromTheViewSchema = schemaOfThePublicType<MessageFromTheView>()(
  Schema.Union([
    Schema.Struct({ kind: Schema.Literal("watch"), watch_id: watchOrAskIdSchema, subject: viewWatchedSubjectSchema }),
    Schema.Struct({ kind: Schema.Literal("stop_watching"), watch_id: watchOrAskIdSchema }),
    Schema.Struct({ kind: Schema.Literal("ask"), ask_id: watchOrAskIdSchema, ask: viewAskSchema, payload: Schema.optional(Schema.Unknown) }),
  ]),
);
