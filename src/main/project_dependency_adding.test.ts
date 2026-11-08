import { describe, expect, test } from "vitest";
import { pyprojectTextWithTheRequirementAdded } from "./project_dependency_adding.js";

describe("adding an import to pyproject.toml", () => {
  test("adds it last to a dependencies list laid out one per line, keeping its indent, comments and the rest of the file", () => {
    const before = [
      "[project]",
      'name = "night-show"',
      "dependencies = [",
      '    "tatolab-stream>=0.68",  # the SDK',
      '    "tatolab-camera"',
      "]",
      "",
      "[tool.uv]",
      "package = false",
      "",
    ].join("\n");
    expect(pyprojectTextWithTheRequirementAdded(before, "tatolab-compositor>=0.68.29")).toEqual({
      ok: true,
      value: [
        "[project]",
        'name = "night-show"',
        "dependencies = [",
        '    "tatolab-stream>=0.68",  # the SDK',
        '    "tatolab-camera",',
        '    "tatolab-compositor>=0.68.29",',
        "]",
        "",
        "[tool.uv]",
        "package = false",
        "",
      ].join("\n"),
    });
  });

  test("keeps a comment after the last item on its line", () => {
    const before = '[project]\nname = "a"\ndependencies = [\n  "tatolab-stream", # pinned by the runtime\n]\n';
    expect(pyprojectTextWithTheRequirementAdded(before, "tatolab-opus")).toEqual({
      ok: true,
      value: '[project]\nname = "a"\ndependencies = [\n  "tatolab-stream", # pinned by the runtime\n  "tatolab-opus",\n]\n',
    });
  });

  test("adds it to a list on one line, and fills an empty one", () => {
    expect(pyprojectTextWithTheRequirementAdded('[project]\nname = "a"\ndependencies = ["tatolab-stream"]\n', "tatolab-opus")).toEqual({
      ok: true,
      value: '[project]\nname = "a"\ndependencies = ["tatolab-stream", "tatolab-opus"]\n',
    });
    expect(pyprojectTextWithTheRequirementAdded('[project]\nname = "a"\ndependencies = []\n', "tatolab-opus")).toEqual({
      ok: true,
      value: '[project]\nname = "a"\ndependencies = ["tatolab-opus"]\n',
    });
  });

  test("gives a project with no dependencies key one under its [project] header, and keeps CRLF line endings", () => {
    expect(pyprojectTextWithTheRequirementAdded('[project]\r\nname = "a"\r\n', "tatolab-opus")).toEqual({
      ok: true,
      value: '[project]\r\ndependencies = ["tatolab-opus"]\r\nname = "a"\r\n',
    });
  });

  test("adds a sample's git requirement as it is", () => {
    const requirement = "camera-halftone @ git+https://github.com/tatolab/streamlib@v0.68.29#subdirectory=examples/camera-halftone";
    const after = pyprojectTextWithTheRequirementAdded('[project]\nname = "a"\ndependencies = ["tatolab-stream"]\n', requirement);
    expect(after).toEqual({ ok: true, value: `[project]\nname = "a"\ndependencies = ["tatolab-stream", "${requirement}"]\n` });
  });

  test("is refused for a project it already imports, under any spelling of its name", () => {
    expect(pyprojectTextWithTheRequirementAdded('[project]\nname = "a"\ndependencies = ["Tatolab_Camera>=0.60"]\n', "tatolab-camera>=0.68")).toEqual({
      ok: false,
      failure: "The project already imports tatolab-camera.",
    });
  });

  test("is refused for a file that is not TOML, has no [project] table, or whose list never closes", () => {
    expect(pyprojectTextWithTheRequirementAdded("[project\n", "tatolab-opus")).toMatchObject({ ok: false, failure: expect.stringContaining("pyproject.toml is not TOML") });
    expect(pyprojectTextWithTheRequirementAdded('[tool.uv]\npackage = false\n', "tatolab-opus")).toEqual({ ok: false, failure: "pyproject.toml has no [project] table." });
    expect(pyprojectTextWithTheRequirementAdded('[project]\nname = "a"\n', "  ")).toEqual({ ok: false, failure: '"  " names no project to import.' });
  });

  test("passes over brackets inside strings and comments", () => {
    const before = '[project]\nname = "a"\ndependencies = [\n  "tatolab-stream[cuda]", # [extra]\n]\n';
    expect(pyprojectTextWithTheRequirementAdded(before, "tatolab-opus")).toEqual({
      ok: true,
      value: '[project]\nname = "a"\ndependencies = [\n  "tatolab-stream[cuda]", # [extra]\n  "tatolab-opus",\n]\n',
    });
  });
});
