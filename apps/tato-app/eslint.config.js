import { defineConfig } from "eslint/config";
import { tatolabTypeScriptLintConfig } from "@tatolab/lint-config/eslint";
import { DOT_INDICATOR_SELECTORS, ROUND_STATUS_ICON_IMPORTS, SVG_CIRCLE_SELECTORS, retiredSampleLintConfig } from "../../packages/package_lint_rules.js";

// ESLint applies one list per rule to a file, so each group of files below gets the whole list of
// restrictions that hold for it, composed from these pieces.

const HAND_BUILT_CONTROL_SELECTORS = [
  { selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]", message: "A screen uses the design system's control, not a hand-built one." },
  { selector: "JSXAttribute[name.name='role'][value.value=/^(radio|radiogroup)$/]", message: "A screen uses the design system's SegmentedChoiceControl, not a hand-built radio role." },
  { selector: "JSXAttribute[name.name='role'] > JSXExpressionContainer > Literal[value=/^(radio|radiogroup)$/]", message: "A screen uses the design system's SegmentedChoiceControl, not a hand-built radio role." },
];
const SHADCN_IMPORT_PATTERNS = [
  {
    group: ["@tatolab/tato-app-view-sdk/design_system/ui/*", "@/components/ui/*", "**/components/ui/*", "@base-ui/react", "@base-ui/react/*"],
    message: "A screen is composed from the view SDK's design system, not from shadcn or base-ui directly.",
  },
];

const VIEW_FULL_ACCESS_SELECTORS = [
  { selector: "Identifier[name=/^(createImageBitmap|ImageBitmap)$/]", message: "A view's frames are transferred VideoFrames, never copied into an ImageBitmap." },
  { selector: "JSXAttribute[name.name='sandbox']", message: "Every view runs with full access on Studio's origin: no sandbox on a view's frame." },
];

const ELECTRON_IMPORT_PATHS = [{ name: "electron", message: "Only src/main/electron_adapters/ and src/preload/ import electron, so everything else runs in plain Node." }];
const ELECTRON_REQUIRE_SELECTORS = [
  { selector: "CallExpression[callee.name='require'][arguments.0.value='electron']", message: ELECTRON_IMPORT_PATHS[0].message },
  { selector: "ImportExpression[source.value='electron']", message: ELECTRON_IMPORT_PATHS[0].message },
];
const PLATFORM_READ_PROPERTIES = [
  { object: "process", property: "platform", message: "Ask the platform layer (src/main/platform/), not process.platform." },
  { object: "os", property: "platform", message: "Ask the platform layer (src/main/platform/), not os.platform()." },
];
const PLATFORM_READ_IMPORTS = [
  { name: "node:os", importNames: ["platform"], message: PLATFORM_READ_PROPERTIES[1].message },
  { name: "os", importNames: ["platform"], message: PLATFORM_READ_PROPERTIES[1].message },
];
const SHIPPED_MAIN_PROCESS_SELECTORS = [
  { selector: "ThrowStatement", message: "No throw in shipped main-process code: return a failure value the caller propagates." },
  { selector: "CallExpression[callee.name=/Sync$/]", message: "No blocking *Sync( call: the main thread draws the tray." },
  { selector: "CallExpression[callee.property.name=/Sync$/]", message: "No blocking *Sync( call: the main thread draws the tray." },
  { selector: "NewExpression[callee.name='Date']", message: "Time is performance.now(); wall-clock time is for display only." },
];
const WALL_CLOCK_PROPERTIES = [{ object: "Date", property: "now", message: "Time is performance.now(); wall-clock time is for display only." }];
const STANDARD_STREAM_WRITE_SELECTORS = [
  { selector: "MemberExpression[object.object.name='process'][object.property.name=/^std(out|err)$/][property.name='write']", message: "The main process logs through tatolab_app_log.ts." },
];

const RUNTIME_CLIENT_IMPORT_PATTERNS = [
  {
    group: ["@tatolab/runtime-client", "@tatolab/runtime-client/*"],
    message: "Only src/main/tatolab_runtime_control_operation_call.ts imports @tatolab/runtime-client; import what it re-exports instead.",
  },
];

const MAIN_PROCESS_FILES = ["src/main/**/*.{ts,cts}", "src/preload/**/*.{ts,cts}"];
const TEST_FILES = ["src/**/*.test.{ts,tsx}", "mock/**/*.test.{ts,tsx}"];

/** The restrictions that hold for one group of main-process files. */
function mainProcessRestrictions({ mayImportElectron, mayReadPlatform, mayImportTheRuntimeClient, isShipped, isTest, mayWriteStandardStreams }) {
  const restrictedSyntax = [
    ...(mayImportElectron ? [] : ELECTRON_REQUIRE_SELECTORS),
    ...(isShipped ? SHIPPED_MAIN_PROCESS_SELECTORS : []),
    ...(isTest || mayWriteStandardStreams ? [] : STANDARD_STREAM_WRITE_SELECTORS),
  ];
  const restrictedImports = [...(mayImportElectron ? [] : ELECTRON_IMPORT_PATHS), ...(mayReadPlatform ? [] : PLATFORM_READ_IMPORTS)];
  const restrictedProperties = [...(mayReadPlatform ? [] : PLATFORM_READ_PROPERTIES), ...(isShipped ? WALL_CLOCK_PROPERTIES : [])];
  return {
    "no-restricted-syntax": ["error", ...restrictedSyntax],
    "no-restricted-imports": ["error", { paths: restrictedImports, patterns: isShipped && !mayImportTheRuntimeClient ? RUNTIME_CLIENT_IMPORT_PATTERNS : [] }],
    "no-restricted-properties": ["error", ...restrictedProperties],
  };
}

const MAIN_PROCESS_GROUPS = [
  { files: ["src/main/electron_adapters/**/*.{ts,cts}"], mayImportElectron: true },
  { files: ["src/preload/**/*.{ts,cts}"], mayImportElectron: true },
  { files: ["src/main/platform/**/*.{ts,cts}"], mayReadPlatform: true },
  { files: ["src/main/tatolab_app_log.ts"], mayWriteStandardStreams: true },
  { files: ["src/main/tatolab_runtime_control_operation_call.ts"], mayImportTheRuntimeClient: true },
];
const FAKE_FILES = ["src/**/fake_*.ts"];

/** A group's file patterns narrowed to one kind of file in it: `*.test.ts` or `fake_*.ts`. */
function filesOfKind(group, kindPattern) {
  return group.files.filter((pattern) => pattern.endsWith("*.{ts,cts}")).map((pattern) => pattern.replace(/\*\.\{ts,cts\}$/, kindPattern));
}

/** Each main-process file in exactly one group, and within it as a shipped file, a fake or a test. */
function mainProcessConfigs() {
  const specialFiles = MAIN_PROCESS_GROUPS.flatMap((group) => group.files);
  const groups = [...MAIN_PROCESS_GROUPS, { files: MAIN_PROCESS_FILES, ignores: specialFiles }];
  return groups.flatMap((group) => [
    {
      files: group.files,
      ignores: [...(group.ignores ?? []), ...TEST_FILES, ...FAKE_FILES],
      rules: mainProcessRestrictions({ ...group, isShipped: true, isTest: false }),
    },
    ...[
      { kindPattern: "fake_*.ts", isTest: false },
      { kindPattern: "*.test.ts", isTest: true },
    ]
      .map(({ kindPattern, isTest }) => ({ files: filesOfKind(group, kindPattern), ignores: group.ignores ?? [], isTest }))
      .filter((kindGroup) => kindGroup.files.length > 0)
      .map(({ files, ignores, isTest }) => ({ files, ignores, rules: mainProcessRestrictions({ ...group, isShipped: false, isTest }) })),
  ]);
}

// A frame meets no Effect: the code each frame runs through, from reading it off the runtime's channel to handing it to
// the window to draw, imports none of it. Opening, closing and reopening a viewer are not on the lane.
const FRAME_LANE_FILES = [
  "src/preload/**/*.{ts,cts}",
  "src/main/runtime_port_viewer_reads.ts",
  "src/main/runtime_viewer_image_frame_import.ts",
  "src/main/runtime_viewer_frame_import_addon.ts",
  "src/main/port_viewer_message_reading.ts",
  "src/main/platform/**/viewer_image_frame_reading*.ts",
  "src/renderer/view_host/port_viewer_connections.ts",
];
const FRAME_LANE_IMPORT_PATTERNS = [{ group: ["effect", "effect/*", "@effect/*"], message: "A frame meets no Effect: the frame lane imports no effect package." }];

const WINDOW_FILES = ["src/renderer/**/*.{ts,tsx}", "src/shared/**/*.ts", "mock/**/*.{ts,tsx}"];
const SCREEN_FILES = ["src/renderer/studio_shell/**/*.tsx", "src/renderer/setup_and_preferences/**/*.tsx", "src/renderer/tatolab_window_view.tsx"];
const ICON_GEOMETRY_FILES = ["src/renderer/icons.ts"];

/** The restrictions that hold for one group of the window's shipped files. */
function windowRestrictions({ isScreen, mayDrawCircles }) {
  return {
    "no-restricted-syntax": ["error", ...VIEW_FULL_ACCESS_SELECTORS, ...DOT_INDICATOR_SELECTORS, ...(mayDrawCircles ? [] : SVG_CIRCLE_SELECTORS), ...(isScreen ? HAND_BUILT_CONTROL_SELECTORS : [])],
    "no-restricted-imports": ["error", { paths: ROUND_STATUS_ICON_IMPORTS, patterns: isScreen ? SHADCN_IMPORT_PATTERNS : [] }],
  };
}

export default defineConfig(
  { ignores: ["out/**", "build/**", "node_modules/**"] },
  ...tatolabTypeScriptLintConfig({ files: ["src/**/*.{ts,tsx,cts}", "mock/**/*.{ts,tsx}"], testFiles: TEST_FILES }),
  ...mainProcessConfigs(),
  { files: WINDOW_FILES, ignores: [...TEST_FILES, ...SCREEN_FILES, ...ICON_GEOMETRY_FILES], rules: windowRestrictions({}) },
  { files: ICON_GEOMETRY_FILES, rules: windowRestrictions({ mayDrawCircles: true }) },
  { files: SCREEN_FILES, ignores: TEST_FILES, rules: windowRestrictions({ isScreen: true }) },
  { files: FRAME_LANE_FILES, rules: { "@typescript-eslint/no-restricted-imports": ["error", { patterns: FRAME_LANE_IMPORT_PATTERNS }] } },
  retiredSampleLintConfig(["src/**/*.{ts,tsx,cts}", "mock/**/*.{ts,tsx}", "scripts/**/*.mjs"]),
);
