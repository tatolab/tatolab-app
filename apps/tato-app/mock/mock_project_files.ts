// The mock's files of the open project as the runtime lists them: streamlib's sample project Pulse Stage, mirrored under
// `mock_pulse_stage_project/` from `examples/pulse-stage` as its files are written there, with a stopped second stream's graph
// document and a view's files beside them, which the code pane reads and saves as it would on disk. A save at a version the
// mock no longer holds is refused as a change on disk.

import type { NodeFileCreated, ProjectFileRead, ProjectFileSaved, ProjectFiles } from "../src/shared/tatolab_backend_contract";
import pulseStageGitignore from "./mock_pulse_stage_project/.gitignore?raw";
import pulseStagePythonVersion from "./mock_pulse_stage_project/.python-version?raw";
import pulseStageBeatPy from "./mock_pulse_stage_project/nodes/beat.py?raw";
import pulseStageClickTrackPy from "./mock_pulse_stage_project/nodes/click_track.py?raw";
import pulseStageNodesInitPy from "./mock_pulse_stage_project/nodes/__init__.py?raw";
import pulseStageLooksPy from "./mock_pulse_stage_project/nodes/looks.py?raw";
import pulseStageStageShadersPy from "./mock_pulse_stage_project/nodes/stage_shaders.py?raw";
import pulseStagePyprojectToml from "./mock_pulse_stage_project/pyproject.toml?raw";
import pulseStageMainGraph from "./mock_pulse_stage_project/streams/main.graph.json?raw";
import pulseStageTitleCardGraph from "./mock_pulse_stage_project/streams/title_card.graph.json?raw";
import pulseStageTatolabProjectJson from "./mock_pulse_stage_project/tatolab-project.json?raw";
import { mockStreamLocationOf } from "./mock_stream_fixtures";

/** Pulse Stage's files, by their `/`-separated path in the project, as `examples/pulse-stage` holds them. */
const PULSE_STAGE_FILES: readonly (readonly [string, string])[] = [
  [".gitignore", pulseStageGitignore],
  [".python-version", pulseStagePythonVersion],
  ["nodes/__init__.py", pulseStageNodesInitPy],
  ["nodes/beat.py", pulseStageBeatPy],
  ["nodes/click_track.py", pulseStageClickTrackPy],
  ["nodes/looks.py", pulseStageLooksPy],
  ["nodes/stage_shaders.py", pulseStageStageShadersPy],
  ["pyproject.toml", pulseStagePyprojectToml],
  ["streams/main.graph.json", pulseStageMainGraph],
  ["streams/title_card.graph.json", pulseStageTitleCardGraph],
  ["tatolab-project.json", pulseStageTatolabProjectJson],
];

/** The graph document of the mock's stopped second stream `rehearsal` in the project at `projectFolder`: the lights alone, in the Program view. */
function rehearsalGraphDocument(projectFolder: string): string {
  const asset = mockStreamLocationOf({ project_directory: projectFolder, stream_name: "rehearsal" }).stream_asset;
  const nodes = [
    { name: "canvas", type: "imports/core-nodes/core_nodes.solid_color:SolidColor", input_values: { width: 1280, height: 720 } },
    { name: "orbits", type: "nodes.stage_shaders:OrbitLights" },
    { name: "program", type: "Core Nodes:program" },
  ];
  const links = [
    { source: { node: "canvas", port: "image" }, target: { node: "orbits", port: "size_from" } },
    { source: { node: "orbits", port: "result" }, target: { node: "program", port: "video" } },
  ];
  return `${JSON.stringify({ asset, links, nodes }, null, 2)}\n`;
}

const DECK_VIEW_JSON = `{
  "contract": "1.0",
  "title": "Deck",
  "entry": "index.html",
  "placement": "area"
}
`;

const DECK_VIEW_INDEX_HTML = `<!doctype html>
<html lang="en">
  <body>
    <div id="deck"></div>
  </body>
</html>
`;

const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The runtime's node template as `create_node_file` writes it, for a class named `className`. */
function nodeFileFromTheTemplate(className: string): string {
  return `from tatolab.stream import Image, Input, Output, RuntimeContextLimitedAccess, node


@node.process(description="Hands on each frame it reads, unchanged.")
class ${className}:
    video_in = Input(Image, delivery="newest", description="The frames this node reads.")
    video_out = Output(Image, description="Each frame read from \`video_in\`, unchanged.")

    def process(self, ctx: RuntimeContextLimitedAccess) -> None:
        frame = ctx.inputs.read(self.video_in)
        if frame is None:
            return
        ctx.outputs.write(self.video_out, frame)
`;
}

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
    this.openProjectFolder = `${streamsFolder}/pulse-stage`;
    this.importFolders = [`${streamsFolder}/camera`, `${streamsFolder}/lobby-recorder`];
    const initialTexts: [string, string][] = [
      ...PULSE_STAGE_FILES.map(([pathInTheProject, text]): [string, string] => [`${this.openProjectFolder}/${pathInTheProject}`, text]),
      [`${this.openProjectFolder}/streams/rehearsal.graph.json`, rehearsalGraphDocument(this.openProjectFolder)],
      [`${this.openProjectFolder}/views/deck/tatolab_view.json`, DECK_VIEW_JSON],
      [`${this.openProjectFolder}/views/deck/index.html`, DECK_VIEW_INDEX_HTML],
      [`${streamsFolder}/camera/pyproject.toml`, '[project]\nname = "camera"\nversion = "0.1.0"\n'],
      [`${streamsFolder}/camera/nodes/camera_frames.py`, "from tatolab.stream import node\n"],
      [`${streamsFolder}/lobby-recorder/pyproject.toml`, '[project]\nname = "lobby-recorder"\nversion = "0.1.0"\n'],
    ];
    for (const [file, text] of initialTexts) this.filesByPath.set(file, { text, version: this.nextVersion() });
  }

  read(file: string): ProjectFileRead {
    const projectFolder = this.projectFolderOf(file);
    const known = this.filesByPath.get(file);
    if (projectFolder === null) throw `${file} is not a file of the open project or its imports, so Tatolab does not open it.`;
    if (known === undefined) throw `ENOENT: no such file or directory, open '${file}'`;
    return { file, project_folder: projectFolder, text: known.text, version: String(known.version), is_editable: projectFolder === this.openProjectFolder };
  }

  save(file: string, text: string, basedOnVersion: string | null): ProjectFileSaved {
    this.refuseUnlessWrittenInTheOpenProject(file);
    const known = this.filesByPath.get(file);
    const versionOnDisk = known === undefined ? null : String(known.version);
    if (versionOnDisk !== basedOnVersion) throw `${file.split("/").at(-1) ?? file} changed since it was opened, so it was not saved.`;
    const saved = { text, version: this.nextVersion() };
    this.filesByPath.set(file, saved);
    return { version: String(saved.version) };
  }

  /** A new node file at `file` from the runtime's node template, refused in the runtime's words as `create_node_file` refuses. */
  createNodeFile(file: string): NodeFileCreated {
    this.refuseUnlessWrittenInTheOpenProject(file);
    const pathInTheProject = this.pathInTheOpenProjectOf(file);
    if (this.filesByPath.has(file)) throw `create_node_file failed: the project already holds \`${pathInTheProject}\`, and a new file is never written over it`;
    if (!pathInTheProject.endsWith(".py")) throw `create_node_file failed: \`${pathInTheProject}\` is not a Python file; name it \`<name>.py\``;
    const moduleParts = pathInTheProject.slice(0, -".py".length).split("/");
    const notAnIdentifier = moduleParts.find((part) => !PYTHON_IDENTIFIER.test(part));
    if (notAnIdentifier !== undefined) {
      throw `create_node_file failed: \`${pathInTheProject}\` is not importable as a Python module: \`${notAnIdentifier}\` is not a Python identifier; use letters, digits and \`_\`, not starting with a digit`;
    }
    const className = (moduleParts.at(-1) ?? "").split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
    this.filesByPath.set(file, { text: nodeFileFromTheTemplate(className), version: this.nextVersion() });
    return { file, node_type: `${moduleParts.join(".")}:${className}` };
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

  /** `file`'s `/`-separated path inside the open project's folder. */
  pathInTheOpenProjectOf(file: string): string {
    return file.slice(this.openProjectFolder.length + 1);
  }

  private refuseUnlessWrittenInTheOpenProject(file: string): void {
    const projectFolder = this.projectFolderOf(file);
    if (projectFolder === null) throw `${file} is not a file of the open project or its imports, so Tatolab does not open it.`;
    if (projectFolder !== this.openProjectFolder) throw `${file} belongs to an imported project, which the studio opens read-only.`;
  }

  private projectFolderOf(file: string): string | null {
    return [this.openProjectFolder, ...this.importFolders].find((folder) => file.startsWith(`${folder}/`)) ?? null;
  }

  private nextVersion(): number {
    this.versionCount += 1;
    return this.versionCount;
  }
}
