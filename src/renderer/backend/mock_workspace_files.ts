// The mock's files of the open workspace: the pattern project's `stream.py`, its two node modules
// and `pyproject.toml`, and the camera import's `stream.py`, which the code pane reads and saves as
// it would on disk. A save at a version the mock no longer holds is refused as a change on disk.

import type { WorkspaceFileRead, WorkspaceFileSaved, WorkspaceProjectFiles } from "../../shared/tatolab_backend_contract";

const PATTERN_STREAM_PY = `from tatolab.stream import Exposure, RelayTrackSource, StreamBuilder, stream
from tatolab.stream import DisplayWindow, Mp4Writer, TestPatternSource

from nodes.brightness_meter import BrightnessMeter
from nodes.inverting_effect import InvertingEffect


@stream
def main(stream_builder: StreamBuilder) -> None:
    """The test pattern, inverted on the GPU, shown in a window and metered."""
    source = stream_builder.add(TestPatternSource, config={"width": 1280, "height": 720, "fps": 30})
    effect = stream_builder.add(InvertingEffect)
    display = stream_builder.add(DisplayWindow, config={"title": "Tatolab", "scaling": "fit"})
    meter = stream_builder.add(BrightnessMeter)
    stream_builder.connect(source.output("video"), effect.input("video_from_upstream"))
    stream_builder.connect(effect.output("video_to_downstream"), display.input("video"))
    stream_builder.connect(effect.output("video_to_downstream"), meter.input("video_from_upstream"))
    stream_builder.expose(effect.output("video_to_downstream"), Exposure.PRIVATE)


@stream
def recorder(stream_builder: StreamBuilder) -> None:
    """Records main's inverted picture to an MP4."""
    main_effect = stream_builder.add(RelayTrackSource, config={"broadcast": "studio/main.hang", "track": "invertingeffect/video_to_downstream"})
    writer = stream_builder.add(Mp4Writer, config={"path": "recordings/main.mp4"})
    stream_builder.connect(main_effect.output("payload"), writer.input("video"))


@stream
def pattern_two(stream_builder: StreamBuilder) -> None:
    """A second test pattern, for trying things beside main."""
    source = stream_builder.add(TestPatternSource)
    display = stream_builder.add(DisplayWindow, config={"title": "Pattern two"})
    stream_builder.connect(source.output("video"), display.input("video"))
`;

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

const CAMERA_STREAM_PY = `from tatolab.stream import CameraSource, DisplayWindow, MicrophoneSource, StreamBuilder, stream

from nodes.level_meter import LevelMeter


@stream
def camera(stream_builder: StreamBuilder) -> None:
    """The built-in camera on screen, and the microphone's level."""
    camera_source = stream_builder.add(CameraSource)
    display = stream_builder.add(DisplayWindow, config={"title": "Camera"})
    microphone = stream_builder.add(MicrophoneSource)
    meter = stream_builder.add(LevelMeter)
    stream_builder.connect(camera_source.output("video"), display.input("video"))
    stream_builder.connect(microphone.output("audio"), meter.input("audio_from_upstream"))
`;

interface MockWorkspaceFile {
  text: string;
  version: number;
}

/** The mock workspace's project files in `streamsFolder`, read and saved as the app does on disk. */
export class MockWorkspaceFiles {
  private readonly filesByPath = new Map<string, MockWorkspaceFile>();
  private versionCount = 0;
  readonly workspaceProjectFolder: string;
  private readonly importFolders: string[];

  constructor(streamsFolder: string) {
    this.workspaceProjectFolder = `${streamsFolder}/pattern`;
    this.importFolders = [`${streamsFolder}/camera`, `${streamsFolder}/lobby-recorder`];
    const initialTexts: [string, string][] = [
      [`${this.workspaceProjectFolder}/stream.py`, PATTERN_STREAM_PY],
      [`${this.workspaceProjectFolder}/nodes/__init__.py`, ""],
      [`${this.workspaceProjectFolder}/nodes/inverting_effect.py`, INVERTING_EFFECT_PY],
      [`${this.workspaceProjectFolder}/nodes/brightness_meter.py`, BRIGHTNESS_METER_PY],
      [`${this.workspaceProjectFolder}/pyproject.toml`, PATTERN_PYPROJECT_TOML],
      [`${streamsFolder}/camera/stream.py`, CAMERA_STREAM_PY],
    ];
    for (const [file, text] of initialTexts) this.filesByPath.set(file, { text, version: this.nextVersion() });
  }

  read(file: string): WorkspaceFileRead {
    const projectFolder = this.projectFolderOf(file);
    const known = this.filesByPath.get(file);
    if (projectFolder === null) throw `${file} is not a file of the open workspace's projects, so Spudnik Studio does not open it.`;
    if (known === undefined) throw `ENOENT: no such file or directory, open '${file}'`;
    return { file, project_folder: projectFolder, text: known.text, version: String(known.version), is_editable: projectFolder === this.workspaceProjectFolder };
  }

  save(file: string, text: string, basedOnVersion: string | null): WorkspaceFileSaved {
    const projectFolder = this.projectFolderOf(file);
    if (projectFolder === null) throw `${file} is not a file of the open workspace's projects, so Spudnik Studio does not open it.`;
    if (projectFolder !== this.workspaceProjectFolder) throw `${file} belongs to an imported project, which the studio opens read-only.`;
    const known = this.filesByPath.get(file);
    const versionOnDisk = known === undefined ? null : String(known.version);
    if (versionOnDisk !== basedOnVersion) throw `${file.split("/").at(-1) ?? file} changed on disk since it was opened, so it was not saved.`;
    const saved = { text, version: this.nextVersion() };
    this.filesByPath.set(file, saved);
    return { version: String(saved.version) };
  }

  list(projectFolder: string): WorkspaceProjectFiles {
    if (projectFolder !== this.workspaceProjectFolder && !this.importFolders.includes(projectFolder)) {
      throw `${projectFolder} is not a project folder of the open workspace.`;
    }
    const files = [...this.filesByPath.keys()]
      .filter((file) => file.startsWith(`${projectFolder}/`))
      .map((file) => file.slice(projectFolder.length + 1))
      .sort();
    return { project_folder: projectFolder, files };
  }

  private projectFolderOf(file: string): string | null {
    return [this.workspaceProjectFolder, ...this.importFolders].find((folder) => file.startsWith(`${folder}/`)) ?? null;
  }

  private nextVersion(): number {
    this.versionCount += 1;
    return this.versionCount;
  }
}
