import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// ESLint applies one list per rule to a file, so each group of files below gets the whole list of
// restrictions that hold for it, composed from these pieces.

const SMALL_SIZE = String.raw`(0\.5|1|1\.5|2|2\.5|3)`;

/** Selectors matched against string literals, template literals and JSX text, with the message each reports. */
const stringPatterns = (regexSource, message) => [
  { selector: `Literal[value=/${regexSource}/]`, message },
  { selector: `TemplateElement[value.raw=/${regexSource}/]`, message },
  { selector: `JSXText[value=/${regexSource}/]`, message },
];

const DOT_MESSAGE = "A small rounded-full element is a dot. Status is a word, and a problem is an icon.";

const DOT_INDICATOR_SELECTORS = [
  ...stringPatterns(String.raw`rounded-full[^"\x60]*\bsize-${SMALL_SIZE}\b|\bsize-${SMALL_SIZE}\b[^"\x60]*rounded-full`, DOT_MESSAGE),
  ...stringPatterns(String.raw`^(?=.*rounded-full)(?=.*\bw-${SMALL_SIZE}\b)(?=.*\bh-${SMALL_SIZE}\b)`, DOT_MESSAGE),
  { selector: String.raw`CallExpression:has(> Literal[value=/\brounded-full\b/]):has(> Literal[value=/\bsize-${SMALL_SIZE}\b/])`, message: DOT_MESSAGE },
  { selector: String.raw`CallExpression:has(> Literal[value=/\brounded-full\b/]):has(> Literal[value=/\bw-${SMALL_SIZE}\b/]):has(> Literal[value=/\bh-${SMALL_SIZE}\b/])`, message: DOT_MESSAGE },
  ...stringPatterns(String.raw`animate-(ping|pulse|breathe)`, "No pulsing indicators."),
  ...stringPatterns("[•●◉⬤]", "No bullet glyphs."),
];
const SVG_CIRCLE_SELECTORS = [
  { selector: "JSXOpeningElement[name.name='circle']", message: "No SVG circle in UI markup: it reads as a dot." },
  ...stringPatterns(String.raw`<circle\b`, "No SVG circle in UI markup: it reads as a dot."),
];
const ROUND_STATUS_ICONS = ["OctagonX", "OctagonAlert", "CircleX", "XCircle", "CircleAlert", "AlertCircle", "CircleDot", "CircleSlash", "CirclePlay", "CirclePause", "CircleStop"];
const ROUND_STATUS_ICON_IMPORTS = [
  { name: "lucide-react", importNames: ROUND_STATUS_ICONS, message: "A round status icon reads as a dot: use TriangleAlert or SquareX." },
];

const HAND_BUILT_CONTROL_SELECTORS = [
  { selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]", message: "A screen uses the design system's control, not a hand-built one." },
  { selector: "JSXAttribute[name.name='role'][value.value=/^(radio|radiogroup)$/]", message: "A screen uses the design system's SegmentedChoiceControl, not a hand-built radio role." },
  { selector: "JSXAttribute[name.name='role'] > JSXExpressionContainer > Literal[value=/^(radio|radiogroup)$/]", message: "A screen uses the design system's SegmentedChoiceControl, not a hand-built radio role." },
];
const SHADCN_IMPORT_PATTERNS = [
  { group: ["@/components/ui/*", "**/components/ui/*", "@base-ui/react", "@base-ui/react/*"], message: "A screen is composed from src/renderer/design_system/, not from shadcn or base-ui directly." },
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
const FOCUSED_OR_SKIPPED_TEST_SELECTORS = [
  { selector: "MemberExpression[object.name=/^(test|it|describe)$/][property.name=/^(only|skip|todo)$/]", message: "No focused, skipped or todo test." },
];

const MAIN_PROCESS_FILES = ["src/main/**/*.{ts,cts}", "src/preload/**/*.{ts,cts}"];
const TEST_FILES = ["src/**/*.test.{ts,tsx}"];

/** The restrictions that hold for one group of main-process files. */
function mainProcessRestrictions({ mayImportElectron, mayReadPlatform, isShipped, isTest, mayWriteStandardStreams }) {
  const restrictedSyntax = [
    ...(mayImportElectron ? [] : ELECTRON_REQUIRE_SELECTORS),
    ...(isShipped ? SHIPPED_MAIN_PROCESS_SELECTORS : []),
    ...(isTest || mayWriteStandardStreams ? [] : STANDARD_STREAM_WRITE_SELECTORS),
    ...(isTest ? FOCUSED_OR_SKIPPED_TEST_SELECTORS : []),
  ];
  const restrictedImports = [...(mayImportElectron ? [] : ELECTRON_IMPORT_PATHS), ...(mayReadPlatform ? [] : PLATFORM_READ_IMPORTS)];
  const restrictedProperties = [...(mayReadPlatform ? [] : PLATFORM_READ_PROPERTIES), ...(isShipped ? WALL_CLOCK_PROPERTIES : [])];
  return {
    "no-restricted-syntax": ["error", ...restrictedSyntax],
    "no-restricted-imports": ["error", { paths: restrictedImports }],
    "no-restricted-properties": ["error", ...restrictedProperties],
    ...(isShipped
      ? {
          "@typescript-eslint/no-explicit-any": "error",
          "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
          "@typescript-eslint/no-non-null-assertion": "error",
        }
      : {}),
    ...(isTest ? {} : { "no-console": "error", "no-debugger": "error" }),
  };
}

const MAIN_PROCESS_GROUPS = [
  { files: ["src/main/electron_adapters/**/*.{ts,cts}"], mayImportElectron: true },
  { files: ["src/preload/**/*.{ts,cts}"], mayImportElectron: true },
  { files: ["src/main/platform/**/*.{ts,cts}"], mayReadPlatform: true },
  { files: ["src/main/tatolab_app_log.ts"], mayWriteStandardStreams: true },
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

const WINDOW_FILES = ["src/renderer/**/*.{ts,tsx}", "src/shared/**/*.ts"];
const SCREEN_FILES = ["src/renderer/views/**/*.tsx"];
const SHADCN_FILES = ["src/renderer/components/ui/**"];
const ICON_GEOMETRY_FILES = ["src/renderer/icons.ts"];

/** The restrictions that hold for one group of the window's shipped files. */
function windowRestrictions({ isScreen, mayDrawCircles }) {
  return {
    "no-console": "error",
    "no-debugger": "error",
    "no-restricted-syntax": ["error", ...DOT_INDICATOR_SELECTORS, ...(mayDrawCircles ? [] : SVG_CIRCLE_SELECTORS), ...(isScreen ? HAND_BUILT_CONTROL_SELECTORS : [])],
    "no-restricted-imports": ["error", { paths: ROUND_STATUS_ICON_IMPORTS, patterns: isScreen ? SHADCN_IMPORT_PATTERNS : [] }],
  };
}

export default defineConfig(
  { ignores: ["out/**", "build/**", "node_modules/**"] },
  {
    files: ["src/**/*.{ts,tsx,cts}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  ...mainProcessConfigs(),
  { files: WINDOW_FILES, ignores: [...TEST_FILES, ...SHADCN_FILES, ...SCREEN_FILES, ...ICON_GEOMETRY_FILES], rules: windowRestrictions({}) },
  { files: ICON_GEOMETRY_FILES, rules: windowRestrictions({ mayDrawCircles: true }) },
  { files: SCREEN_FILES, ignores: TEST_FILES, rules: windowRestrictions({ isScreen: true }) },
  { files: SHADCN_FILES, ignores: TEST_FILES, rules: { "no-console": "error", "no-debugger": "error" } },
);
