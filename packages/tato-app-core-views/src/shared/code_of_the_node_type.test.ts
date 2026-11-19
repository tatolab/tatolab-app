import { describe, expect, it, vi } from "vitest";
import type { ImportedProject, NodeTypeDescribedOrWhyNot, NodeTypeSourceListed, ProjectNodeTypesDescribedReading, TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { codeOfTheNodeType, openTheCodeOfTheNodeType } from "./code_of_the_node_type";

const listed = (nodeType: string) => ({ node_type: nodeType, documentation: "", category: null, kind: "process" as const, described_from: "interpreter" as const });

const PAINT_PULSE: NodeTypeSourceListed = { source: "project", node_types: [listed("nodes.paint_ball:PaintBall"), listed("nodes.half_read:HalfRead"), listed("nodes.placeless:Placeless")], graph_generators: [], unreadable_modules: [] };
const STAGE_LIGHTS: NodeTypeSourceListed = { source: "dependency", project: "lights-uuid", folder: "stage-lights", version: "1.0.0", project_name: "Stage Lights", node_types: [listed("imports/stage-lights/nodes.dimmer:Dimmer")], graph_generators: [], unreadable_modules: [] };
const GONE: NodeTypeSourceListed = { source: "dependency", project: "gone-uuid", folder: "gone", version: "1.0.0", project_name: null, node_types: [listed("imports/gone/nodes.left:Left")], graph_generators: [], unreadable_modules: [] };
const TEST_PATTERN: NodeTypeSourceListed = { source: "installed_distribution", distribution: "tatolab-testpattern", distribution_version: "0.68.82", node_types: [listed("tatolab.testpattern:TestPatternSource")], graph_generators: [], unreadable_modules: [] };
const BUILT_IN: NodeTypeSourceListed = { source: "built_in", node_types: [listed("tatolab.stream:GraphInput")], graph_generators: [], unreadable_modules: [] };

const describedAt = (nodeType: string, declaredAt: { path: string; line?: number } | null, source: Pick<NodeTypeSourceListed, "source"> & Partial<{ project: string; folder: string; version: string; project_name: string | null }>): NodeTypeDescribedOrWhyNot => {
  const description = { node_type: nodeType, described_from: "interpreter" as const, documentation: "", declared_at: declaredAt, inputs: [], outputs: [] };
  return source.source === "dependency" ? { ...description, source: "dependency", project: source.project ?? "", folder: source.folder ?? "", version: source.version ?? "", project_name: source.project_name ?? null } : { ...description, source: "project" };
};

const LISTED: ProjectNodeTypesDescribedReading = {
  kind: "listed",
  node_types: {
    listing: { project_directory: "/w/paint-pulse/", project: "paint-uuid", project_name: "Paint Pulse", sources: [PAINT_PULSE, STAGE_LIGHTS, GONE, TEST_PATTERN, BUILT_IN] },
    described: [
      describedAt("nodes.paint_ball:PaintBall", { path: "nodes/paint_ball.py", line: 27 }, { source: "project" }),
      { node_type: "nodes.half_read:HalfRead", not_described_because: { refusal_code: "refused", action: "describe_node_types", runtime_words: "SyntaxError: expected ':'" }, source: "project" },
      describedAt("nodes.placeless:Placeless", null, { source: "project" }),
      describedAt("imports/stage-lights/nodes.dimmer:Dimmer", { path: "nodes/dimmer.py" }, { source: "dependency", project: "lights-uuid", folder: "stage-lights", version: "1.0.0", project_name: "Stage Lights" }),
      describedAt("imports/gone/nodes.left:Left", { path: "nodes/left.py", line: 3 }, { source: "dependency", project: "gone-uuid", folder: "gone", version: "1.0.0", project_name: null }),
    ],
  },
};

const STAGE_LIGHTS_IMPORTED: ImportedProject = {
  project: "lights-uuid",
  name: "Stage Lights",
  folder: "stage-lights",
  source: { kind: "folder", project: { folder: "/w/paint-pulse/imports/stage-lights", project: "lights-uuid", name: "Stage Lights" } },
};

describe("a node type's code", () => {
  it("opens the project's own file that declares the type, at the line it is declared at", () => {
    expect(codeOfTheNodeType(LISTED, [], "nodes.paint_ball:PaintBall")).toEqual({ kind: "opens", on: { kind: "file", file: "/w/paint-pulse/nodes/paint_ball.py", line: 27 } });
  });

  it("opens an import's file from the import's folder, at its top when the runtime names no line", () => {
    expect(codeOfTheNodeType(LISTED, [STAGE_LIGHTS_IMPORTED], "imports/stage-lights/nodes.dimmer:Dimmer")).toEqual({ kind: "opens", on: { kind: "file", file: "/w/paint-pulse/imports/stage-lights/nodes/dimmer.py" } });
  });

  it("says why a built-in's, an installed distribution's or an import the project no longer holds has no file to open", () => {
    const why = (nodeType: string, imports: readonly ImportedProject[] = []) => {
      const code = codeOfTheNodeType(LISTED, imports, nodeType);
      return code.kind === "does_not_open" ? code.because : null;
    };
    expect(why("tatolab.stream:GraphInput")).toBe("tatolab.stream:GraphInput is built into the runtime, which ships no file of its code.");
    expect(why("tatolab.testpattern:TestPatternSource")).toBe("tatolab.testpattern:TestPatternSource comes from tatolab-testpattern 0.68.82, installed with the runtime, not from a file of the project.");
    expect(why("imports/gone/nodes.left:Left")).toBe("imports/gone/nodes.left:Left comes from imports/gone, which the open project doesn't import.");
    expect(why("imports/stage-lights/nodes.dimmer:Dimmer", [{ ...STAGE_LIGHTS_IMPORTED, source: { kind: "folder_unreadable", folder: "/w/paint-pulse/imports/stage-lights", refusal: "permission denied" } }])).toBe(
      "imports/stage-lights can't be read: permission denied",
    );
  });

  it("says why the runtime gives no file: a type it couldn't describe, names no place for, or doesn't list, and node types not read yet", () => {
    const why = (reading: ProjectNodeTypesDescribedReading | null, nodeType: string) => {
      const code = codeOfTheNodeType(reading, [], nodeType);
      return code.kind === "does_not_open" ? code.because : null;
    };
    expect(why(LISTED, "nodes.half_read:HalfRead")).toBe("The runtime couldn't describe nodes.half_read:HalfRead: SyntaxError: expected ':'");
    expect(why(LISTED, "nodes.placeless:Placeless")).toBe("The runtime doesn't say which file declares nodes.placeless:Placeless.");
    expect(why(LISTED, "nodes.renamed:Elsewhere")).toBe("The runtime lists no node type nodes.renamed:Elsewhere for this project.");
    expect(why({ kind: "not_listed", because: "no runtime answered" }, "nodes.paint_ball:PaintBall")).toBe("The runtime lists no node types: no runtime answered");
    expect(why(null, "nodes.paint_ball:PaintBall")).toBe("Studio is still reading the project's node types.");
  });

  it("opens in Code when it has a file, and answers as a refused ask with why when it has none", async () => {
    const openView = vi.fn<TatoAppViewConnection["openView"]>(() => Promise.resolve({ kind: "done" }));
    const connection: Pick<TatoAppViewConnection, "openView"> = { openView };
    await expect(openTheCodeOfTheNodeType(connection, codeOfTheNodeType(LISTED, [], "nodes.paint_ball:PaintBall"))).resolves.toEqual({ kind: "done" });
    expect(openView).toHaveBeenCalledWith("code", { kind: "file", file: "/w/paint-pulse/nodes/paint_ball.py", line: 27 });
    await expect(openTheCodeOfTheNodeType(connection, codeOfTheNodeType(LISTED, [], "tatolab.stream:GraphInput"))).resolves.toEqual({
      kind: "refused",
      because: "tatolab.stream:GraphInput is built into the runtime, which ships no file of its code.",
    });
    expect(openView).toHaveBeenCalledOnce();
  });
});
