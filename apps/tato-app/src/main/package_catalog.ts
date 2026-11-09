// The package and sample catalog the module manager's Marketplace lists, one JSON file on get.tatolab.com that streamlib's
// release writes. An entry the app cannot read is left out and counted, so one bad entry never
// hides the rest; a catalog of another version is refused whole.

import type { PackageCatalogDownload, PackageCatalogEntry, PackageCatalogMember, PackageCatalogReading } from "../shared/tatolab_backend_contract.js";
import {
  arrayOrEmpty,
  everyOneRead,
  isAJsonObject,
  jsonObject,
  optionalText,
  parseJsonOnTheWire,
  requiredText,
  type JsonObjectOnTheWire,
} from "./json_on_the_wire.js";
import { failedWith, succeeded, type Result } from "./result.js";

/** Where the catalog is served. */
export const PACKAGE_CATALOG_URL = "https://get.tatolab.com/catalog/v1.json";

/** The catalog version this app reads. */
const PACKAGE_CATALOG_VERSION_READ = 1;

/** Fetches `url` over HTTPS and answers its body, refused in words for a failed request or a status other than 200. */
export type FetchTextOverHttps = (url: string) => Promise<Result<string, string>>;

/** Fetches `url` over HTTPS and answers its body's bytes, refused in words for a failed request, a status other than 200, or a body over `largestByteCount`. */
export type FetchBytesOverHttps = (url: string, largestByteCount: number) => Promise<Result<Buffer, string>>;

function packageCatalogMemberFrom(value: unknown): Result<PackageCatalogMember, string> {
  const member = jsonObject(value, "a catalog entry's node or stream");
  if (!member.ok) return member;
  const name = requiredText(member.value, "name");
  if (!name.ok) return name;
  const importPath = requiredText(member.value, "import_path");
  if (!importPath.ok) return importPath;
  const summary = optionalText(member.value, "summary");
  if (!summary.ok) return summary;
  return succeeded({ name: name.value, import_path: importPath.value, summary: summary.value ?? "" });
}

function membersFrom(entry: JsonObjectOnTheWire, key: "nodes" | "streams"): Result<PackageCatalogMember[], string> {
  const members = arrayOrEmpty(entry, key);
  return members.ok ? everyOneRead(members.value, packageCatalogMemberFrom) : members;
}

/** `download_url`, an `https:` URL of a `.zip`, and `download_sha256` together, `null` where the entry names neither, or why they do not read. */
function packageCatalogDownloadFrom(entry: JsonObjectOnTheWire): Result<PackageCatalogDownload | null, string> {
  const url = optionalText(entry, "download_url");
  if (!url.ok) return url;
  const sha256 = optionalText(entry, "download_sha256");
  if (!sha256.ok) return sha256;
  if (url.value === null && sha256.value === null) return succeeded(null);
  if (url.value === null || sha256.value === null) return failedWith("a catalog entry names one of `download_url` and `download_sha256` without the other");
  if (!url.value.startsWith("https://")) return failedWith(`a catalog entry's download_url ${url.value} is not an https: URL`);
  if (!/^[0-9a-f]{64}$/.test(sha256.value)) return failedWith(`a catalog entry's download_sha256 ${sha256.value} is not a SHA-256 in lowercase hex`);
  return succeeded({ url: url.value, sha256: sha256.value });
}

/** One catalog entry as version 1 serves it, or why it does not read. */
export function packageCatalogEntryFrom(value: unknown): Result<PackageCatalogEntry, string> {
  const entry = jsonObject(value, "a catalog entry");
  if (!entry.ok) return entry;
  const kind = requiredText(entry.value, "kind");
  if (!kind.ok) return kind;
  if (kind.value !== "package" && kind.value !== "sample") return failedWith(`a catalog entry's kind is "${kind.value}", neither "package" nor "sample"`);
  const texts: Record<"name" | "title" | "summary" | "version", string> = { name: "", title: "", summary: "", version: "" };
  for (const key of ["name", "title", "summary", "version"] as const) {
    const text = requiredText(entry.value, key);
    if (!text.ok) return text;
    texts[key] = text.value;
  }
  const nodes = membersFrom(entry.value, "nodes");
  if (!nodes.ok) return nodes;
  const streams = membersFrom(entry.value, "streams");
  if (!streams.ok) return streams;
  const homepageUrl = optionalText(entry.value, "homepage_url");
  if (!homepageUrl.ok) return homepageUrl;
  const download = packageCatalogDownloadFrom(entry.value);
  if (!download.ok) return download;
  return succeeded({ kind: kind.value, ...texts, download: download.value, nodes: nodes.value, streams: streams.value, homepage_url: homepageUrl.value });
}

/** The catalog `catalogText` holds, each entry that does not read left out and counted, or why the catalog as a whole does not read. */
export function packageCatalogReadingFromTheCatalogText(catalogText: string): PackageCatalogReading {
  const parsed = parseJsonOnTheWire(catalogText);
  if (!parsed.ok) return { kind: "not_read", because: `The catalog at ${PACKAGE_CATALOG_URL} is not JSON: ${parsed.failure}` };
  if (!isAJsonObject(parsed.value)) return { kind: "not_read", because: `The catalog at ${PACKAGE_CATALOG_URL} is not a JSON object.` };
  const catalogVersion = parsed.value["catalog_version"];
  if (catalogVersion !== PACKAGE_CATALOG_VERSION_READ) {
    return { kind: "not_read", because: `The catalog at ${PACKAGE_CATALOG_URL} is version ${JSON.stringify(catalogVersion) ?? "none"}; this Tato Studio reads version ${PACKAGE_CATALOG_VERSION_READ}. A newer Tato Studio may read it.` };
  }
  const entries = arrayOrEmpty(parsed.value, "entries");
  if (!entries.ok) return { kind: "not_read", because: `The catalog at ${PACKAGE_CATALOG_URL} does not read: ${entries.failure}` };
  const readEntries: PackageCatalogEntry[] = [];
  let unreadableEntryCount = 0;
  for (const entryValue of entries.value) {
    const entry = packageCatalogEntryFrom(entryValue);
    if (entry.ok) readEntries.push(entry.value);
    else unreadableEntryCount += 1;
  }
  return { kind: "read", entries: readEntries, unreadable_entry_count: unreadableEntryCount };
}

/** The catalog as get.tatolab.com serves it now, fetched afresh each time it is asked for, or why it was not read. */
export async function readThePackageCatalog(fetchTextOverHttps: FetchTextOverHttps): Promise<PackageCatalogReading> {
  const catalogText = await fetchTextOverHttps(PACKAGE_CATALOG_URL);
  if (!catalogText.ok) return { kind: "not_read", because: `The catalog at ${PACKAGE_CATALOG_URL} could not be fetched: ${catalogText.failure}` };
  return packageCatalogReadingFromTheCatalogText(catalogText.value);
}
