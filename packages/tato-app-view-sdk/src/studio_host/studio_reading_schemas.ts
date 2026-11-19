// Schemas of the readings someone else may hand the Studio back: a value a view sends as JSON, and
// what a layout pin an earlier run kept, or a view's ask, names.

import { Schema } from "effect";
import type { JsonValue, PortViewerTarget, ProjectStreamsRecovery, ProjectTransactionAuthor, StreamTabAddress, StudioSelection } from "../studio_readings.js";
import { schemaOfThePublicType } from "./schema_of_a_public_type.js";

/** A value as JSON carries it. */
export const jsonValueSchema = schemaOfThePublicType<JsonValue>()(Schema.MutableJson);

const levelSchema = Schema.optional(Schema.mutable(Schema.Array(Schema.String)));

/** What Studio has selected; a selection of nodes names two or more. */
export const studioSelectionSchema = schemaOfThePublicType<StudioSelection>()(
  Schema.Union([
    Schema.Struct({ kind: Schema.Literal("nothing") }),
    Schema.Struct({ kind: Schema.Literal("project"), project_name: Schema.String, project_folder: Schema.NullOr(Schema.String) }),
    Schema.Struct({ kind: Schema.Literal("stream"), stream: Schema.String, project_folder: Schema.String }),
    Schema.Struct({ kind: Schema.Literal("node"), stream: Schema.String, node: Schema.String, level: levelSchema }),
    Schema.Struct({ kind: Schema.Literal("nodes"), stream: Schema.String, nodes: Schema.mutable(Schema.Array(Schema.String)).check(Schema.isMinLength(2)), level: levelSchema }),
  ]),
);

/** A stream a tab is open on. */
export const streamTabAddressSchema = schemaOfThePublicType<StreamTabAddress>()(Schema.Struct({ stream: Schema.String, project_name: Schema.String, display_name: Schema.String }));

/** The output port of a running node a port viewer reads. */
export const portViewerTargetSchema = schemaOfThePublicType<PortViewerTarget>()(Schema.Struct({ stream: Schema.String, node_id: Schema.String, port: Schema.String }));

/** Whose change an undo or a redo reverses. */
/** What a view asks Studio to recover a project's streams with. */
export const projectStreamsRecoverySchema = schemaOfThePublicType<ProjectStreamsRecovery>()(Schema.Literals(["restart_the_playback", "reload_the_project"]));

export const projectTransactionAuthorSchema = schemaOfThePublicType<ProjectTransactionAuthor>()(Schema.Struct({ kind: Schema.Literals(["person", "agent"]), name: Schema.String }));
