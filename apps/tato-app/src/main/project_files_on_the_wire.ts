// A project's files as the runtime's file tools answer them: `list_project_files` names each by its
// `/`-separated path in the project and its length, `read_project_file` carries the bytes as
// standard base64 with padding, and `write_project_file` and `create_node_file` name the transaction that recorded
// it, `create_node_file` with the node type, `<module>:<class>`, the new file declares.

import { everyOneRead, jsonObject, parseJsonOnTheWire, requiredArray, requiredText, requiredUnsignedInteger } from "./json_on_the_wire.js";
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

/** The files `list_project_files` answered with `toolResultText`, or why it could not be read. */
export function projectFilesFromTheListProjectFilesToolResult(toolResultText: string): Result<ProjectFileTheRuntimeListed[], string> {
  const listed = filesFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return listed.ok ? listed : failedWith(`the runtime's list_project_files result could not be read: ${listed.failure}`);
}

function filesFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<ProjectFileTheRuntimeListed[], string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the listing");
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

/** The bytes `read_project_file` answered with `toolResultText`, or why they could not be read. */
export function projectFileBytesFromTheReadProjectFileToolResult(toolResultText: string): Result<Buffer, string> {
  const fileBytes = bytesFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return fileBytes.ok ? fileBytes : failedWith(`the runtime's read_project_file result could not be read: ${fileBytes.failure}`);
}

const STANDARD_BASE64_ALPHABET_WITH_PADDING = /^[A-Za-z0-9+/]*={0,2}$/;

function isStandardBase64WithPadding(text: string): boolean {
  return text.length % 4 === 0 && STANDARD_BASE64_ALPHABET_WITH_PADDING.test(text);
}

function bytesFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<Buffer, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the file read");
  if (!toolResult.ok) return toolResult;
  const contentBase64 = requiredText(toolResult.value, "content_base64");
  if (!contentBase64.ok) return contentBase64;
  const byteLen = requiredUnsignedInteger(toolResult.value, "byte_len");
  if (!byteLen.ok) return byteLen;
  if (!isStandardBase64WithPadding(contentBase64.value)) return failedWith("`content_base64` is not standard base64 with padding");
  const fileBytes = Buffer.from(contentBase64.value, "base64");
  if (fileBytes.length !== byteLen.value) return failedWith(`\`content_base64\` holds ${fileBytes.length} bytes where \`byte_len\` says ${byteLen.value}`);
  return succeeded(fileBytes);
}

/** The transaction `write_project_file` answered with `toolResultText`, or why it could not be read. */
export function projectFileWriteFromTheWriteProjectFileToolResult(toolResultText: string): Result<ProjectFileWriteRecorded, string> {
  const written = writeFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return written.ok ? written : failedWith(`the runtime's write_project_file result could not be read: ${written.failure}`);
}

function writeFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<ProjectFileWriteRecorded, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the file write");
  if (!toolResult.ok) return toolResult;
  const filePath = requiredText(toolResult.value, "path");
  if (!filePath.ok) return filePath;
  const transaction = requiredText(toolResult.value, "transaction");
  if (!transaction.ok) return transaction;
  const commit = requiredText(toolResult.value, "commit");
  if (!commit.ok) return commit;
  return succeeded({ path: filePath.value, transaction: transaction.value, commit: commit.value });
}

/** What `create_node_file` recorded: the file's path, the node type it declares as `add_node` takes it, the transaction's UUID and the commit holding it. */
export interface NodeFileCreationRecorded {
  path: string;
  node_type: string;
  transaction: string;
  commit: string;
}

/** The node file `create_node_file` answered with `toolResultText`, or why it could not be read. */
export function nodeFileCreationFromTheCreateNodeFileToolResult(toolResultText: string): Result<NodeFileCreationRecorded, string> {
  const created = nodeFileCreationFromTheParsedToolResult(parseJsonOnTheWire(toolResultText));
  return created.ok ? created : failedWith(`the runtime's create_node_file result could not be read: ${created.failure}`);
}

function nodeFileCreationFromTheParsedToolResult(parsedToolResult: Result<unknown, string>): Result<NodeFileCreationRecorded, string> {
  if (!parsedToolResult.ok) return parsedToolResult;
  const toolResult = jsonObject(parsedToolResult.value, "the node file created");
  if (!toolResult.ok) return toolResult;
  const filePath = requiredText(toolResult.value, "path");
  if (!filePath.ok) return filePath;
  const nodeType = requiredText(toolResult.value, "node_type");
  if (!nodeType.ok) return nodeType;
  const transaction = requiredText(toolResult.value, "transaction");
  if (!transaction.ok) return transaction;
  const commit = requiredText(toolResult.value, "commit");
  if (!commit.ok) return commit;
  return succeeded({ path: filePath.value, node_type: nodeType.value, transaction: transaction.value, commit: commit.value });
}
