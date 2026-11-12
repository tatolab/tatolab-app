import { expect, test } from "vitest";
import { projectNodeTypeListingFromTheToolResult } from "./project_node_type_listing.js";

/** A listing spelled as the runtime's `ListProjectNodeTypesToolResult` serializes one: each source's origin flat under `source`. */
function listingText(sources: unknown[]): string {
  return JSON.stringify({ project_directory: "/w/pattern", project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90", project_name: "pattern", sources });
}

const EMPTY_SOURCE_LISTS = { node_types: [], graph_generators: [], unreadable_modules: [] };

test("each_source_reads_with_its_origin_node_types_ports_generators_and_unreadable_modules", () => {
  const listing = projectNodeTypeListingFromTheToolResult(
    JSON.parse(listingText([
      {
        source: "project",
        node_types: [
          {
            type: "nodes.inverting_effect:InvertingEffect",
            kind: "process",
            description: "Inverts every frame's colours on the GPU.",
            category: "Effects",
            inputs: [{ name: "video_from_upstream", family: "image", description: "", annotation: null }],
            outputs: [{ name: "video_to_downstream", family: null, description: "Inverted frames", annotation: null }],
            path: "nodes/inverting_effect.py",
            line: 10,
          },
        ],
        graph_generators: [
          {
            generator: "nodes.scenes:side_by_side",
            description: "Two cameras side by side.",
            promoted_config: [{ name: "left_camera", annotation: "str", default: null }, { name: "gap", annotation: null, default_as_written: "GAP * 2" }],
            path: "nodes/scenes.py",
            line: 8,
          },
        ],
        unreadable_modules: [{ module: "nodes.half_written", path: "nodes/half_written.py", line: 12, column: 5, why: "SyntaxError: expected ':'" }],
      },
      {
        source: "dependency",
        project: "6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11",
        folder: "gripper",
        version: "ab".repeat(32),
        node_types: [
          {
            type: "nodes.gripper:Gripper",
            kind: "function",
            description: "",
            category: "nodes.gripper",
            inputs: [{ name: "grip", family: "channels", description: "", annotation: "float | None", pin_default: null }],
            outputs: null,
            path: "nodes/gripper.py",
            line: 4,
          },
        ],
        graph_generators: [],
        unreadable_modules: [],
      },
      { source: "installed_distribution", distribution: "camera", distribution_version: "0.1.0", ...EMPTY_SOURCE_LISTS },
    ])),
  );

  expect(listing).toEqual({
    ok: true,
    value: {
      project_directory: "/w/pattern",
      project: "2c4b1f0e-9a77-4c1d-8e55-3d0f6a2b7c90",
      project_name: "pattern",
      sources: [
        {
          origin: { source: "project" },
          node_types: [
            {
              type: "nodes.inverting_effect:InvertingEffect",
              kind: "process",
              description: "Inverts every frame's colours on the GPU.",
              category: "Effects",
              inputs: [{ name: "video_from_upstream", family: "image", description: "", annotation: null }],
              outputs: [{ name: "video_to_downstream", family: null, description: "Inverted frames", annotation: null }],
              path: "nodes/inverting_effect.py",
              line: 10,
            },
          ],
          graph_generators: [
            {
              generator: "nodes.scenes:side_by_side",
              description: "Two cameras side by side.",
              promoted_config: [{ name: "left_camera", annotation: "str" }, { name: "gap", annotation: null }],
              path: "nodes/scenes.py",
              line: 8,
            },
          ],
          unreadable_modules: [{ module: "nodes.half_written", path: "nodes/half_written.py", line: 12, column: 5, why: "SyntaxError: expected ':'" }],
        },
        {
          origin: { source: "dependency", project: "6f1c2a52-8f0e-4d55-9a57-1f1b8f6f0a11", folder: "gripper", version: "ab".repeat(32) },
          node_types: [
            {
              type: "nodes.gripper:Gripper",
              kind: "function",
              description: "",
              category: "nodes.gripper",
              inputs: [{ name: "grip", family: "channels", description: "", annotation: "float | None" }],
              outputs: null,
              path: "nodes/gripper.py",
              line: 4,
            },
          ],
          graph_generators: [],
          unreadable_modules: [],
        },
        { origin: { source: "installed_distribution", distribution: "camera", distribution_version: "0.1.0" }, ...EMPTY_SOURCE_LISTS },
      ],
    },
  });
});

test("an_entry_point_whose_declaration_source_does_not_show_reads_with_no_kind_ports_or_place", () => {
  const listing = projectNodeTypeListingFromTheToolResult(
    JSON.parse(listingText([
      {
        source: "installed_distribution",
        distribution: "tatolab-testpattern",
        distribution_version: "0.3.2",
        node_types: [{ type: "tatolab.testpattern:TestPatternSource", kind: null, description: "", category: "tatolab.testpattern", inputs: null, outputs: null, path: null, line: null }],
        graph_generators: [],
        unreadable_modules: [{ module: "tatolab.testpattern.broken", path: "tatolab/testpattern/broken.py", line: null, column: null, why: "could not be read: Permission denied" }],
      },
    ])),
  );

  expect(listing.ok && listing.value.sources[0]).toEqual({
    origin: { source: "installed_distribution", distribution: "tatolab-testpattern", distribution_version: "0.3.2" },
    node_types: [{ type: "tatolab.testpattern:TestPatternSource", kind: null, description: "", category: "tatolab.testpattern", inputs: null, outputs: null, path: null, line: null }],
    graph_generators: [],
    unreadable_modules: [{ module: "tatolab.testpattern.broken", path: "tatolab/testpattern/broken.py", line: null, column: null, why: "could not be read: Permission denied" }],
  });
});

test("a_source_of_an_origin_newer_than_this_app_still_lists_under_the_name_the_runtime_gives_it", () => {
  const listing = projectNodeTypeListingFromTheToolResult(JSON.parse(listingText([{ source: "workspace_member", member: "lights", ...EMPTY_SOURCE_LISTS }])));

  expect(listing.ok && listing.value.sources[0]?.origin).toEqual({ source: "newer_than_this_app", source_name: "workspace_member" });
});

test("a_listing_missing_a_field_is_refused_naming_it", () => {
  expect(projectNodeTypeListingFromTheToolResult(JSON.parse(listingText([{ source: "project", node_types: [], graph_generators: [] }])))).toEqual({
    ok: false,
    failure: "the runtime's list_project_node_types result could not be read: missing field `unreadable_modules`",
  });
  expect(projectNodeTypeListingFromTheToolResult({ project_directory: "/w/pattern", project: "p", sources: [] })).toEqual({
    ok: false,
    failure: "the runtime's list_project_node_types result could not be read: missing field `project_name`",
  });
});
