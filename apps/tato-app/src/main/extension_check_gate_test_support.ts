import { createHash } from "node:crypto";
import { EXTENSION_SDK_PACKAGE_NAME, STUDIO_EXTENSION_SDK_VERSION } from "./extension_check_gate.js";
import { controlOperationResultResponse } from "./fake_local_api_server.js";

/** The SHA-256 of `fileText`'s bytes, as the runtime writes a hash. */
export function sha256OfTheText(fileText: string): string {
  return createHash("sha256").update(Buffer.from(fileText, "utf8")).digest("hex");
}

/** The runtime's `read_project_file` answer for `filePath` holding `fileText`, as the contract writes it. */
export function fileReadAnswer(filePath: string, fileText: string): Buffer {
  const fileBytes = Buffer.from(fileText, "utf8");
  return controlOperationResultResponse({ path: filePath, byte_len: fileBytes.length, content_base64: fileBytes.toString("base64"), content_sha256: sha256OfTheText(fileText) });
}

/** A `checked_with` entry naming the extension SDK at `sdkVersion`, as the runtime writes it. */
export function sdkAsCheckedWith(sdkVersion: string = STUDIO_EXTENSION_SDK_VERSION): string {
  return `${EXTENSION_SDK_PACKAGE_NAME} ${sdkVersion} (runtime unit's kit, /opt/tatolab/lib/tatolab/extension-sdk)`;
}

/** A `check_project_code` answer that passed `filesChecked` (path in the checked project to text), checked with the SDK at `sdkVersion`. */
export function passingCheckAnswer(filesChecked: Readonly<Record<string, string>>, sdkVersion: string = STUDIO_EXTENSION_SDK_VERSION): Buffer {
  return controlOperationResultResponse({
    verdict: "passed",
    checks: [
      { check: "python_node_declarations", state: "passed", checked_with: [] },
      { check: "extension_manifest", state: "passed", checked_with: [] },
      { check: "extension_types", state: "passed", checked_with: ["tsc 7.0.2", sdkAsCheckedWith(sdkVersion)] },
      { check: "extension_lint", state: "passed", checked_with: ["oxlint 1.91.0", sdkAsCheckedWith(sdkVersion)] },
    ],
    findings: [],
    files_checked: Object.entries(filesChecked).map(([filePath, fileText]) => ({ path: filePath, content_sha256: sha256OfTheText(fileText) })),
  });
}

/**
 * The runtime's answers, in order, to the gate passing the folder `folderInTheProject` holding `files` (path in the folder to text): its listing,
 * each file's read, and a passing check, whose paths drop `prefixInTheOpenProject` as an import's own check names them.
 */
export function answersOfAFolderPassingTheGate(folderInTheProject: string, files: Readonly<Record<string, string>>, prefixInTheOpenProject = ""): Buffer[] {
  const filesInTheProject = Object.entries(files).map(([fileInTheFolder, fileText]) => [`${folderInTheProject}/${fileInTheFolder}`, fileText] as const);
  return [
    controlOperationResultResponse({ files: filesInTheProject.map(([filePath, fileText]) => ({ path: filePath, byte_len: Buffer.byteLength(fileText) })) }),
    ...filesInTheProject.map(([filePath, fileText]) => fileReadAnswer(filePath, fileText)),
    passingCheckAnswer(Object.fromEntries(filesInTheProject.map(([filePath, fileText]) => [filePath.slice(prefixInTheOpenProject.length), fileText]))),
  ];
}

/** A finding of the runtime's TypeScript check, as the contract writes one. */
export interface TypeErrorFound {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly words: string;
}

/**
 * The runtime's answers, in order, to the gate reading the folder `folderInTheProject` holding `files` (path in the folder to text) and checking it
 * with the type error `found`: its listing, each file's read, and a failed check.
 */
export function answersOfAFolderFailingTheGate(folderInTheProject: string, files: Readonly<Record<string, string>>, found: TypeErrorFound): Buffer[] {
  const filesInTheProject = Object.entries(files).map(([fileInTheFolder, fileText]) => [`${folderInTheProject}/${fileInTheFolder}`, fileText] as const);
  return [
    controlOperationResultResponse({ files: filesInTheProject.map(([filePath, fileText]) => ({ path: filePath, byte_len: Buffer.byteLength(fileText) })) }),
    ...filesInTheProject.map(([filePath, fileText]) => fileReadAnswer(filePath, fileText)),
    controlOperationResultResponse({
      verdict: "failed",
      checks: [
        { check: "extension_types", state: "failed", checked_with: ["tsc 7.0.2", sdkAsCheckedWith()] },
        { check: "extension_lint", state: "passed", checked_with: ["oxlint 1.91.0", sdkAsCheckedWith()] },
      ],
      findings: [{ check: "extension_types", finding_code: "TS2322", severity: "error", words: found.words, path: found.path, line: found.line, column: found.column }],
      files_checked: filesInTheProject.map(([filePath, fileText]) => ({ path: filePath, content_sha256: sha256OfTheText(fileText) })),
    }),
  ];
}
