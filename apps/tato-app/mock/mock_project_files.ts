// The mock's files of the open project as the runtime lists them: the pattern project's graph documents, its two node modules,
// `pyproject.toml`, `tatolab-project.json` and a view's files, which the code pane reads and saves as it would on disk. A save at a version the mock no longer holds is refused as a change on disk.

import type { ProjectFileRead, ProjectFileSaved, ProjectFiles } from "../src/shared/tatolab_backend_contract";
import { mockStreamLocationOf } from "./mock_stream_fixtures";

/** A graph document as the runtime writes one: the stream asset's UUID as `asset`, then its nodes and links. */
function mockGraphDocument(asset: string, nodes: readonly { name: string; type: string; config: Record<string, unknown> }[], links: readonly [string, string, string, string][]): string {
  return `${JSON.stringify(
    {
      asset,
      links: links.map(([sourceNode, sourcePort, targetNode, targetPort]) => ({ source: { node: sourceNode, port: sourcePort }, target: { node: targetNode, port: targetPort } })),
      nodes,
    },
    null,
    2,
  )}\n`;
}

/** The pattern project's stream assets' graph documents, by stream name. */
function patternGraphDocuments(patternFolder: string): [string, string][] {
  const assetOf = (streamName: string) => mockStreamLocationOf({ project_directory: patternFolder, stream_name: streamName }).stream_asset;
  return [
    [
      "main",
      mockGraphDocument(
        assetOf("main"),
        [
          { name: "testpatternsource", type: "tatolab.testpattern:TestPatternSource", config: { width: 1280, height: 720, fps: 30 } },
          { name: "invertingeffect", type: "nodes.inverting_effect:InvertingEffect", config: {} },
          { name: "displaywindow", type: "DisplayWindow", config: { title: "Tatolab", scaling: "fit" } },
          { name: "brightnessmeter", type: "nodes.brightness_meter:BrightnessMeter", config: {} },
        ],
        [
          ["testpatternsource", "video", "invertingeffect", "video_from_upstream"],
          ["invertingeffect", "video_to_downstream", "displaywindow", "video"],
          ["invertingeffect", "video_to_downstream", "brightnessmeter", "video_from_upstream"],
        ],
      ),
    ],
    [
      "pattern_two",
      mockGraphDocument(
        assetOf("pattern_two"),
        [
          { name: "testpatternsource", type: "tatolab.testpattern:TestPatternSource", config: {} },
          { name: "displaywindow", type: "DisplayWindow", config: { title: "Pattern two" } },
        ],
        [["testpatternsource", "video", "displaywindow", "video"]],
      ),
    ],
  ];
}

const INVERTING_EFFECT_PY = `from tatolab.stream import GlslPixelEffect, RuntimeContextFullAccess, RuntimeContextLimitedAccess, VideoFrame, msgpack, node

INVERT_GLSL = """
vec4 effect(vec4 source, ivec2 at) {
    return vec4(1.0 - source.rgb, source.a);
}
"""


@node
class InvertingEffect:
    """Inverts every frame's colours on the GPU."""

    @node.input(delivery_profile="newest")
    def video_from_upstream(self) -> VideoFrame: ...

    @node.output()
    def video_to_downstream(self) -> VideoFrame: ...

    def setup(self, ctx: RuntimeContextFullAccess) -> None:
        self.invert = GlslPixelEffect.compile(ctx.gpu_full_access, effect_glsl=INVERT_GLSL)

    def process(self, ctx: RuntimeContextLimitedAccess) -> None:
        frame = ctx.inputs.read("video_from_upstream", into=VideoFrame)
        if frame is None:
            return
        ctx.outputs.write("video_to_downstream", msgpack.pack(self.invert.apply_to_frame(ctx.gpu_limited_access, frame)))
`;

const BRIGHTNESS_METER_PY = `import numpy
from tatolab.stream import RuntimeContextLimitedAccess, VideoFrame, log, node

BRIGHTNESS_REPORT_INTERVAL_NS = 1_000_000_000


@node
class BrightnessMeter:
    """Logs the mean brightness of the frames it sees, once a second."""

    next_report_at_ns: int = 0

    @node.input(delivery_profile="newest")
    def video_from_upstream(self) -> VideoFrame: ...

    def process(self, ctx: RuntimeContextLimitedAccess) -> None:
        frame = ctx.inputs.read("video_from_upstream", into=VideoFrame)
        if frame is None or ctx.time < self.next_report_at_ns:
            return
        with frame.cpu() as pixels:
            brightness = float(numpy.mean(pixels[:, :, :3]))
        log.info("brightness", mean=round(brightness, 1))
        self.next_report_at_ns = ctx.time + BRIGHTNESS_REPORT_INTERVAL_NS
`;

const PATTERN_PYPROJECT_TOML = `[project]
name = "pattern"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["tatolab-stream>=0.55", "camera", "lobby-recorder", "stage-lights", "tatolab-testpattern>=0.3"]

[tool.uv.sources]
camera = { path = "../camera" }
lobby-recorder = { path = "../lobby-recorder" }
stage-lights = { path = "imports/stage-lights" }
`;

const PATTERN_TATOLAB_PROJECT_JSON = `{
  "project": "5f0c2a9e-7b1d-4e3a-9c84-2d6f1b0a7e53",
  "name": "pattern"
}
`;

const PATTERN_DECK_VIEW_JSON = `{
  "contract": "1.0",
  "title": "Deck",
  "entry": "index.html",
  "placement": "area"
}
`;

const PATTERN_DECK_VIEW_INDEX_HTML = `<!doctype html>
<html lang="en">
  <body>
    <div id="deck"></div>
  </body>
</html>
`;

interface MockProjectFile {
  text: string;
  version: number;
}

/** The mock open project's files in `streamsFolder`, read and saved as the app does on disk. */
export class MockProjectFiles {
  private readonly filesByPath = new Map<string, MockProjectFile>();
  private versionCount = 0;
  readonly openProjectFolder: string;
  private readonly importFolders: string[];

  constructor(streamsFolder: string) {
    this.openProjectFolder = `${streamsFolder}/pattern`;
    this.importFolders = [`${streamsFolder}/camera`, `${streamsFolder}/lobby-recorder`];
    const initialTexts: [string, string][] = [
      ...patternGraphDocuments(this.openProjectFolder).map(([streamName, graphDocument]): [string, string] => [`${this.openProjectFolder}/streams/${streamName}.graph.json`, graphDocument]),
      [`${this.openProjectFolder}/nodes/__init__.py`, ""],
      [`${this.openProjectFolder}/nodes/inverting_effect.py`, INVERTING_EFFECT_PY],
      [`${this.openProjectFolder}/nodes/brightness_meter.py`, BRIGHTNESS_METER_PY],
      [`${this.openProjectFolder}/pyproject.toml`, PATTERN_PYPROJECT_TOML],
      [`${this.openProjectFolder}/tatolab-project.json`, PATTERN_TATOLAB_PROJECT_JSON],
      [`${this.openProjectFolder}/.gitignore`, ".venv/\n__pycache__/\n"],
      [`${this.openProjectFolder}/views/deck/tatolab_view.json`, PATTERN_DECK_VIEW_JSON],
      [`${this.openProjectFolder}/views/deck/index.html`, PATTERN_DECK_VIEW_INDEX_HTML],
    ];
    for (const [file, text] of initialTexts) this.filesByPath.set(file, { text, version: this.nextVersion() });
  }

  read(file: string): ProjectFileRead {
    const projectFolder = this.projectFolderOf(file);
    const known = this.filesByPath.get(file);
    if (projectFolder === null) throw `${file} is not a file of the open project or its imports, so Tato Studio does not open it.`;
    if (known === undefined) throw `ENOENT: no such file or directory, open '${file}'`;
    return { file, project_folder: projectFolder, text: known.text, version: String(known.version), is_editable: projectFolder === this.openProjectFolder };
  }

  save(file: string, text: string, basedOnVersion: string | null): ProjectFileSaved {
    const projectFolder = this.projectFolderOf(file);
    if (projectFolder === null) throw `${file} is not a file of the open project or its imports, so Tato Studio does not open it.`;
    if (projectFolder !== this.openProjectFolder) throw `${file} belongs to an imported project, which the studio opens read-only.`;
    const known = this.filesByPath.get(file);
    const versionOnDisk = known === undefined ? null : String(known.version);
    if (versionOnDisk !== basedOnVersion) throw `${file.split("/").at(-1) ?? file} changed on disk since it was opened, so it was not saved.`;
    const saved = { text, version: this.nextVersion() };
    this.filesByPath.set(file, saved);
    return { version: String(saved.version) };
  }

  list(projectFolder: string): ProjectFiles {
    if (projectFolder !== this.openProjectFolder && !this.importFolders.includes(projectFolder)) {
      throw `${projectFolder} is not the folder of the open project or of one of its imports.`;
    }
    const files = [...this.filesByPath.keys()]
      .filter((file) => file.startsWith(`${projectFolder}/`))
      .map((file) => file.slice(projectFolder.length + 1))
      .sort();
    return { project_folder: projectFolder, files };
  }

  private projectFolderOf(file: string): string | null {
    return [this.openProjectFolder, ...this.importFolders].find((folder) => file.startsWith(`${folder}/`)) ?? null;
  }

  private nextVersion(): number {
    this.versionCount += 1;
    return this.versionCount;
  }
}
