// A project's files as the runtime's file tools answer them: `list_project_files` names each by its
// `/`-separated path in the project and its length, `read_project_file` carries the bytes as
// standard base64 with padding, and `write_project_file` and `create_node_file` name the transaction that recorded
// it, `create_node_file` with the node type, `<module>:<class>`, the new file declares.

import { everyOneRead, jsonObject, type JsonObjectOnTheWire, requiredArray, requiredText, requiredUnsignedInteger } from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** One file `list_project_files` named: its `/`-separated path in the project and its length in bytes. */
export interface ProjectFileTheRuntimeListed {
  path: string;
  byte_len: number;
}

/** What `write_project_file` recorded: the file's path, the transaction's UUID and the commit on the project's history holding it. */
export interface ProjectFileWriteRecorded {
  path: string;
  transaction: string;
  commit: string;
}

/** The files `list_project_files` answered with `operationResult`, or why it could not be read. */
export function projectFilesFromTheListProjectFilesToolResult(operationResult: unknown): Result<ProjectFileTheRuntimeListed[], string> {
  const listed = filesFromTheParsedToolResult(operationResult);
  return listed.ok ? listed : failedWith(`the runtime's list_project_files result could not be read: ${listed.failure}`);
}

function filesFromTheParsedToolResult(operationResult: unknown): Result<ProjectFileTheRuntimeListed[], string> {
  const toolResult = jsonObject(operationResult, "the listing");
  if (!toolResult.ok) return toolResult;
  const files = requiredArray(toolResult.value, "files");
  if (!files.ok) return files;
  return everyOneRead(files.value, (listedFile) => {
    const fileFields = jsonObject(listedFile, "a listed file");
    if (!fileFields.ok) return fileFields;
    const filePath = requiredText(fileFields.value, "path");
    if (!filePath.ok) return filePath;
    const byteLen = requiredUnsignedInteger(fileFields.value, "byte_len");
    if (!byteLen.ok) return byteLen;
    return succeeded({ path: filePath.value, byte_len: byteLen.value });
  });
}

/** The bytes `read_project_file` answered with `operationResult`, or why they could not be read. */
export function projectFileBytesFromTheReadProjectFileToolResult(operationResult: unknown): Result<Buffer, string> {
  const fileBytes = bytesFromTheParsedToolResult(operationResult);
  return fileBytes.ok ? fileBytes : failedWith(`the runtime's read_project_file result could not be read: ${fileBytes.failure}`);
}

const STANDARD_BASE64_ALPHABET_WITH_PADDING = /^[A-Za-z0-9+/]*={0,2}$/;

function isStandardBase64WithPadding(text: string): boolean {
  return text.length % 4 === 0 && STANDARD_BASE64_ALPHABET_WITH_PADDING.test(text);
}

function bytesFromTheParsedToolResult(operationResult: unknown): Result<Buffer, string> {
  const toolResult = jsonObject(operationResult, "the file read");
  if (!toolResult.ok) return toolResult;
  return bytesOfTheBase64Content(toolResult.value);
}

/** The bytes a tool result carries as `content_base64`, standard base64 with padding, checked against its `byte_len`. */
export function bytesOfTheBase64Content(toolResult: JsonObjectOnTheWire): Result<Buffer, string> {
  const contentBase64 = requiredText(toolResult, "content_base64");
  if (!contentBase64.ok) return contentBase64;
  const byteLen = requiredUnsignedInteger(toolResult, "byte_len");
  if (!byteLen.ok) return byteLen;
  if (!isStandardBase64WithPadding(contentBase64.value)) return failedWith("`content_base64` is not standard base64 with padding");
  const fileBytes = Buffer.from(contentBase64.value, "base64");
  if (fileBytes.length !== byteLen.value) return failedWith(`\`content_base64\` holds ${fileBytes.length} bytes where \`byte_len\` says ${byteLen.value}`);
  return succeeded(fileBytes);
}

/** The transaction `write_project_file` answered with `operationResult`, or why it could not be read. */
export function projectFileWriteFromTheWriteProjectFileToolResult(operationResult: unknown): Result<ProjectFileWriteRecorded, string> {
  const written = writeFromTheParsedToolResult(operationResult);
  return written.ok ? written : failedWith(`the runtime's write_project_file result could not be read: ${written.failure}`);
}

function writeFromTheParsedToolResult(operationResult: unknown): Result<ProjectFileWriteRecorded, string> {
  const toolResult = jsonObject(operationResult, "the file write");
  return toolResult.ok ? fileTransactionRecordedIn(toolResult.value) : toolResult;
}

function fileTransactionRecordedIn(toolResult: JsonObjectOnTheWire): Result<ProjectFileWriteRecorded, string> {
  const filePath = requiredText(toolResult, "path");
  if (!filePath.ok) return filePath;
  const transaction = requiredText(toolResult, "transaction");
  if (!transaction.ok) return transaction;
  const commit = requiredText(toolResult, "commit");
  if (!commit.ok) return commit;
  return succeeded({ path: filePath.value, transaction: transaction.value, commit: commit.value });
}

/** What `create_node_file` recorded: the file's path, the node type it declares as `add_node` takes it, the transaction's UUID and the commit holding it. */
export interface NodeFileCreationRecorded extends ProjectFileWriteRecorded {
  node_type: string;
}

/** The node file `create_node_file` answered with `operationResult`, or why it could not be read. */
export function nodeFileCreationFromTheCreateNodeFileToolResult(operationResult: unknown): Result<NodeFileCreationRecorded, string> {
  const created = nodeFileCreationFromTheParsedToolResult(operationResult);
  return created.ok ? created : failedWith(`the runtime's create_node_file result could not be read: ${created.failure}`);
}

function nodeFileCreationFromTheParsedToolResult(operationResult: unknown): Result<NodeFileCreationRecorded, string> {
  const toolResult = jsonObject(operationResult, "the node file created");
  if (!toolResult.ok) return toolResult;
  const recorded = fileTransactionRecordedIn(toolResult.value);
  if (!recorded.ok) return recorded;
  const nodeType = requiredText(toolResult.value, "node_type");
  if (!nodeType.ok) return nodeType;
  return succeeded({ ...recorded.value, node_type: nodeType.value });
}
