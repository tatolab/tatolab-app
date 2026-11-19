import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { MarketplaceImportStage, PackageCatalogEntry } from "../shared/tatolab_backend_contract.js";
import { downloadTheCatalogEntrysZip, LARGEST_MODULE_DOWNLOAD_BYTES, type MarketplaceDownloadFollowing } from "./marketplace_module_download.js";
import type { FetchBytesOverHttps } from "./package_catalog.js";
import { failedWith, succeeded } from "./result.js";

const ZIP_BYTES_THE_CATALOG_NAMES = Buffer.from("PK\u0003\u0004 the halftone project");
const ZIP_URL = "https://get.tatolab.com/packages/tatolab-halftone-0.3.1.zip";

function catalogEntryNaming(download: PackageCatalogEntry["download"], overrides: Partial<PackageCatalogEntry> = {}): PackageCatalogEntry {
  return {
    kind: "package",
    name: "tatolab-halftone",
    title: "Halftone",
    summary: "A halftone lens.",
    version: "0.3.1",
    download,
    nodes: [],
    streams: [],
    homepage_url: null,
    platforms: null,
    runs_on_this_machine: true,
    lowest_runtime_version: null,
    newer_runtime_it_needs: null,
    ...overrides,
  };
}

const SHA256_OF_THE_CATALOGS_ZIP = createHash("sha256").update(ZIP_BYTES_THE_CATALOG_NAMES).digest("hex");

/** A fetch answering `answer` and recording each URL and byte bound asked of it. */
function fetchAnswering(answer: Awaited<ReturnType<FetchBytesOverHttps>>) {
  const fetchesAsked: { url: string; largestByteCount: number }[] = [];
  const fetchBytesOverHttps: FetchBytesOverHttps = async (url, largestByteCount) => {
    fetchesAsked.push({ url, largestByteCount });
    return answer;
  };
  return { fetchBytesOverHttps, fetchesAsked };
}

let scratchDirectory = "";
let downloadsFolder = "";
beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(tmpdir(), "tatolab-module-download-"));
  downloadsFolder = path.join(scratchDirectory, "module-downloads");
});
afterEach(async () => {
  await rm(scratchDirectory, { recursive: true, force: true });
});

test("a download whose SHA-256 matches the catalog's lands as <name>-<version>.zip, fetched bounded to the largest download", async () => {
  const { fetchBytesOverHttps, fetchesAsked } = fetchAnswering(succeeded(ZIP_BYTES_THE_CATALOG_NAMES));
  const downloaded = await downloadTheCatalogEntrysZip(catalogEntryNaming({ url: ZIP_URL, sha256: SHA256_OF_THE_CATALOGS_ZIP }), fetchBytesOverHttps, downloadsFolder, null);

  expect(downloaded).toEqual(succeeded(path.join(downloadsFolder, "tatolab-halftone-0.3.1.zip")));
  expect(await readFile(path.join(downloadsFolder, "tatolab-halftone-0.3.1.zip"))).toEqual(ZIP_BYTES_THE_CATALOG_NAMES);
  expect(await readdir(downloadsFolder)).toEqual(["tatolab-halftone-0.3.1.zip"]);
  expect(fetchesAsked).toEqual([{ url: ZIP_URL, largestByteCount: LARGEST_MODULE_DOWNLOAD_BYTES }]);
});

test("an entry the catalog names no download for is refused without fetching", async () => {
  const { fetchBytesOverHttps, fetchesAsked } = fetchAnswering(succeeded(ZIP_BYTES_THE_CATALOG_NAMES));
  expect(await downloadTheCatalogEntrysZip(catalogEntryNaming(null), fetchBytesOverHttps, downloadsFolder, null)).toEqual(failedWith({ kind: "refused", because: "The catalog names no download for Halftone." }));
  expect(fetchesAsked).toEqual([]);
});

test("a name or version that would leave the downloads folder or hide the file is refused without fetching", async () => {
  for (const overrides of [{ name: "../escape" }, { version: "0.3.1/../../x" }, { name: "..\\escape" }, { name: ".hidden" }]) {
    const { fetchBytesOverHttps, fetchesAsked } = fetchAnswering(succeeded(ZIP_BYTES_THE_CATALOG_NAMES));
    const entry = catalogEntryNaming({ url: ZIP_URL, sha256: SHA256_OF_THE_CATALOGS_ZIP }, overrides);
    expect(await downloadTheCatalogEntrysZip(entry, fetchBytesOverHttps, downloadsFolder, null)).toEqual(
      failedWith({ kind: "refused", because: `The catalog's name ${entry.name} or version ${entry.version} is not one a file can be named by.` }),
    );
    expect(fetchesAsked).toEqual([]);
  }
  await expect(readdir(downloadsFolder)).rejects.toThrow();
});

test("a failed fetch is refused in the fetch's own words and leaves nothing behind", async () => {
  const { fetchBytesOverHttps } = fetchAnswering(failedWith("HTTP 404"));
  expect(await downloadTheCatalogEntrysZip(catalogEntryNaming({ url: ZIP_URL, sha256: SHA256_OF_THE_CATALOGS_ZIP }), fetchBytesOverHttps, downloadsFolder, null)).toEqual(
    failedWith({ kind: "refused", because: `${ZIP_URL} could not be downloaded: HTTP 404` }),
  );
  await expect(readdir(downloadsFolder)).rejects.toThrow();
});

test("a download whose SHA-256 is not the catalog's is refused naming both, and is never written", async () => {
  const tamperedBytes = Buffer.from("PK\u0003\u0004 something else");
  const { fetchBytesOverHttps } = fetchAnswering(succeeded(tamperedBytes));
  const tamperedSha256 = createHash("sha256").update(tamperedBytes).digest("hex");
  expect(await downloadTheCatalogEntrysZip(catalogEntryNaming({ url: ZIP_URL, sha256: SHA256_OF_THE_CATALOGS_ZIP }), fetchBytesOverHttps, downloadsFolder, null)).toEqual(
    failedWith({ kind: "refused", because: `${ZIP_URL} downloaded with the SHA-256 ${tamperedSha256}, not the catalog's ${SHA256_OF_THE_CATALOGS_ZIP}; nothing was imported.` }),
  );
  await expect(readdir(downloadsFolder)).rejects.toThrow();
});

test("a downloads folder that cannot be made is refused naming the zip's path", async () => {
  await writeFile(downloadsFolder, "a file where the downloads folder goes");
  const { fetchBytesOverHttps } = fetchAnswering(succeeded(ZIP_BYTES_THE_CATALOG_NAMES));
  const downloaded = await downloadTheCatalogEntrysZip(catalogEntryNaming({ url: ZIP_URL, sha256: SHA256_OF_THE_CATALOGS_ZIP }), fetchBytesOverHttps, downloadsFolder, null);

  expect(downloaded.ok || downloaded.failure.kind !== "refused" ? "" : downloaded.failure.because).toContain(`Tato Studio couldn't write ${path.join(downloadsFolder, "tatolab-halftone-0.3.1.zip")}: `);
  expect(await readFile(downloadsFolder, "utf8")).toBe("a file where the downloads folder goes");
});

/** A following that records each stage told, stopped once `stopper` aborts. */
function followingRecorded(stopper = new AbortController()) {
  const stagesTold: MarketplaceImportStage[] = [];
  const following: MarketplaceDownloadFollowing = { stageReached: (stage) => stagesTold.push(stage), stopped: stopper.signal };
  return { following, stagesTold, stopper };
}

test("a followed download tells downloading from nothing, each run of bytes the fetch reads, then verifying with the catalog's SHA-256", async () => {
  const { following, stagesTold } = followingRecorded();
  const fetchBytesOverHttps: FetchBytesOverHttps = async (_url, _largestByteCount, fetchFollowing) => {
    fetchFollowing?.bytesRead(10, ZIP_BYTES_THE_CATALOG_NAMES.length);
    fetchFollowing?.bytesRead(ZIP_BYTES_THE_CATALOG_NAMES.length, ZIP_BYTES_THE_CATALOG_NAMES.length);
    return succeeded(ZIP_BYTES_THE_CATALOG_NAMES);
  };
  const downloaded = await downloadTheCatalogEntrysZip(catalogEntryNaming({ url: ZIP_URL, sha256: SHA256_OF_THE_CATALOGS_ZIP }), fetchBytesOverHttps, downloadsFolder, following);

  expect(downloaded).toEqual(succeeded(path.join(downloadsFolder, "tatolab-halftone-0.3.1.zip")));
  expect(stagesTold).toEqual([
    { kind: "downloading", bytes_read: 0, bytes_total: null },
    { kind: "downloading", bytes_read: 10, bytes_total: ZIP_BYTES_THE_CATALOG_NAMES.length },
    { kind: "downloading", bytes_read: ZIP_BYTES_THE_CATALOG_NAMES.length, bytes_total: ZIP_BYTES_THE_CATALOG_NAMES.length },
    { kind: "verifying", sha256: SHA256_OF_THE_CATALOGS_ZIP },
  ]);
});

test("a download stopped while it reads answers stopped, hands the fetch the stop, and is never checked or written", async () => {
  const { following, stagesTold, stopper } = followingRecorded();
  let fetchStoppedBy: AbortSignal | null = null;
  const fetchBytesOverHttps: FetchBytesOverHttps = async (_url, _largestByteCount, fetchFollowing) => {
    fetchStoppedBy = fetchFollowing?.stopped ?? null;
    stopper.abort();
    return failedWith("This operation was aborted");
  };
  const downloaded = await downloadTheCatalogEntrysZip(catalogEntryNaming({ url: ZIP_URL, sha256: SHA256_OF_THE_CATALOGS_ZIP }), fetchBytesOverHttps, downloadsFolder, following);

  expect(downloaded).toEqual(failedWith({ kind: "stopped" }));
  expect(fetchStoppedBy).toBe(stopper.signal);
  expect(stagesTold).toEqual([{ kind: "downloading", bytes_read: 0, bytes_total: null }]);
  await expect(readdir(downloadsFolder)).rejects.toThrow();
});
