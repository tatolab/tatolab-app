// The mock's package catalog, as streamlib's release serves it at get.tatolab.com: the
// packages a show reaches for and two sample projects. `?catalog=unserved` answers the refusal a
// Tato Studio gets when the catalog's URL answers 404.

import type { PackageCatalogDownload, PackageCatalogEntry, PackageCatalogMachine, PackageCatalogReading, TatolabPlatform } from "../src/shared/tatolab_backend_contract";

const MOCK_CATALOG_VERSION = "0.68.29";

function mockDownloadOf(name: string): PackageCatalogDownload {
  return { url: `https://get.tatolab.com/modules/${name}-${MOCK_CATALOG_VERSION}.zip`, sha256: "4f7a9c1e3b5d7f9a1c3e5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f70" };
}

const MOCK_MACOS_ARM64: PackageCatalogMachine = { sys_platform: "darwin", platform_machine: "arm64" };
const MOCK_LINUX_X86_64: PackageCatalogMachine = { sys_platform: "linux", platform_machine: "x86_64" };

/** The machine the mock's `?platform=` stands for, as the catalog names one. */
export function mockMachineModulesInstallOn(platform: TatolabPlatform): PackageCatalogMachine {
  return platform === "linux" ? MOCK_LINUX_X86_64 : MOCK_MACOS_ARM64;
}

function mockPackage(name: string, title: string, summary: string, nodes: [string, string, string][], platforms: PackageCatalogMachine[] = [MOCK_MACOS_ARM64, MOCK_LINUX_X86_64]): PackageCatalogEntry {
  return {
    kind: "package",
    name,
    title,
    summary,
    version: MOCK_CATALOG_VERSION,
    download: mockDownloadOf(name),
    nodes: nodes.map(([nodeName, importPath, nodeSummary]) => ({ name: nodeName, import_path: importPath, summary: nodeSummary })),
    streams: [],
    homepage_url: null,
    platforms,
    runs_on_this_machine: true,
  };
}

function mockSample(name: string, title: string, summary: string, nodes: [string, string, string][]): PackageCatalogEntry {
  const moduleName = name.replaceAll("-", "_");
  return {
    kind: "sample",
    name,
    title,
    summary,
    version: MOCK_CATALOG_VERSION,
    download: mockDownloadOf(name),
    nodes: nodes.map(([nodeName, importPath, nodeSummary]) => ({ name: nodeName, import_path: importPath, summary: nodeSummary })),
    streams: [{ name: "main", import_path: `${moduleName}.stream:main`, summary: summary }],
    homepage_url: `https://github.com/tatolab/streamlib/tree/main/examples/${name}`,
    platforms: null,
    runs_on_this_machine: true,
  };
}

/** The entries the mock catalog lists. */
export const MOCK_PACKAGE_CATALOG_ENTRIES: readonly PackageCatalogEntry[] = [
  mockPackage("tatolab-camera", "Camera", "Captures frames from a camera on the machine.", [["CameraSource", "tatolab.camera:CameraSource", "Frames from one camera, at the rate it gives them."]]),
  mockPackage("tatolab-microphone", "Microphone", "Captures audio from a microphone on the machine.", [["MicrophoneSource", "tatolab.microphone:MicrophoneSource", "Channels from one input device."]]),
  mockPackage("tatolab-compositor", "Compositor", "Layers images into one frame on the GPU.", [
    ["Compositor", "tatolab.compositor:Compositor", "Stacks its inputs, each with a blend and an opacity."],
    ["LowerThird", "tatolab.compositor:LowerThird", "Draws a name and a title over the frame."],
  ]),
  mockPackage("tatolab-opus", "Opus", "Encodes and decodes audio as Opus.", [
    ["OpusEncoder", "tatolab.opus:OpusEncoder", "Channels in, Opus packets out."],
    ["OpusDecoder", "tatolab.opus:OpusDecoder", "Opus packets in, channels out."],
  ]),
  mockPackage(
    "tatolab-browser",
    "Web page",
    "A web page as a stream source, rendered offscreen by the machine's shared browser. Linux only.",
    [["BrowserSource", "tatolab.browser.browser_source:BrowserSource", "A web page's frames and audio."]],
    [MOCK_LINUX_X86_64],
  ),
  mockPackage("tatolab-testpattern", "Test pattern", "Bars, a sweep and a moving marker, for checking a chain.", [["TestPatternSource", "tatolab.testpattern:TestPatternSource", "SMPTE bars with a moving marker."]]),
  mockSample("camera-halftone", "Camera halftone", "A camera through a halftone lens effect, shown in a window.", [["HalftoneLensEffect", "nodes.halftone_lens_effect:HalftoneLensEffect", "Turns a frame into halftone dots."]]),
  mockSample("lower-third", "Lower third", "A test pattern with a name and title over it.", []),
];

/** The mock catalog's entry `name` as read on `platform`'s machine; `undefined` for one it does not list. */
export function mockPackageCatalogEntryNamed(name: string, platform: TatolabPlatform): PackageCatalogEntry | undefined {
  const entry = MOCK_PACKAGE_CATALOG_ENTRIES.find((listed) => listed.name === name);
  return entry === undefined ? undefined : mockEntryReadOn(entry, platform);
}

function mockEntryReadOn(entry: PackageCatalogEntry, platform: TatolabPlatform): PackageCatalogEntry {
  const thisMachine = mockMachineModulesInstallOn(platform);
  const runsOnThisMachine = entry.platforms === null || entry.platforms.some((machine) => machine.sys_platform === thisMachine.sys_platform && machine.platform_machine === thisMachine.platform_machine);
  return { ...structuredClone(entry), runs_on_this_machine: runsOnThisMachine };
}

/** What the mock answers `read_package_catalog` with on `platform`'s machine. */
export function mockPackageCatalogReading(isTheCatalogUnserved: boolean, platform: TatolabPlatform): PackageCatalogReading {
  if (isTheCatalogUnserved) return { kind: "not_read", because: "The catalog at https://get.tatolab.com/catalog/v1.json could not be fetched: HTTP 404 Not Found" };
  return { kind: "read", entries: MOCK_PACKAGE_CATALOG_ENTRIES.map((entry) => mockEntryReadOn(entry, platform)), unreadable_entry_count: 0 };
}
