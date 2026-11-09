// Decides what the release workflow ships: the streamlib release the app bundles, with its Linux
// runtime tarball on get.tatolab.com, and the app version it releases as. The app version is the
// bundled runtime's when that is newer than every app version shipped, and otherwise the last
// shipped app version's next patch, so every release is newer than the last and the updaters take it.
//
// Usage: node scripts/plan_tatolab_app_release.mjs [STREAMLIB_VERSION]
//   STREAMLIB_VERSION  the streamlib release to bundle; blank bundles the one get.tatolab.com
//                      serves as `latest`
//   GITHUB_OUTPUT      where the plan is written as step outputs; printed when unset
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** The update feed's base, and the record the publish step writes there of the release it shipped. */
export const GET_TATOLAB_COM_URL = "https://get.tatolab.com";
export const PUBLISHED_RELEASE_RECORD_PATH = "app/tato-studio-release.json";

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/** `version` as [major, minor, patch], or `null` when it is not X.Y.Z. */
export function semverParts(version) {
  const match = SEMVER_PATTERN.exec(version);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Negative, zero or positive as X.Y.Z `left` is older than, the same as, or newer than `right`. */
export function compareSemver(left, right) {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  if (leftParts === null || rightParts === null) throw new Error(`not X.Y.Z: ${leftParts === null ? left : right}`);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function nextPatchOf(version) {
  const parts = semverParts(version);
  if (parts === null) throw new Error(`not X.Y.Z: ${version}`);
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

/**
 * The plan for one run: `streamlibVersion` is the streamlib release to bundle, and `publishedAppVersion` the app
 * version the feed last shipped, or `null` when it has shipped nothing.
 */
export function planTatolabAppRelease({ streamlibVersion, publishedAppVersion }) {
  if (publishedAppVersion === null) return { appVersion: streamlibVersion };
  const nextPatch = nextPatchOf(publishedAppVersion);
  return { appVersion: compareSemver(streamlibVersion, nextPatch) >= 0 ? streamlibVersion : nextPatch };
}

/** The `version:` line of an electron-updater manifest, or `null`. */
export function versionOfTheUpdateManifest(manifestText) {
  const match = /^version: *(\S+)$/m.exec(manifestText);
  return match === null ? null : match[1];
}

async function fetchOrNull(url, init) {
  const response = await fetch(url, init);
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
}

async function streamlibVersionServedAsLatest() {
  const latestResponse = await fetch(`${GET_TATOLAB_COM_URL}/latest`, { cache: "no-store" });
  if (!latestResponse.ok) throw new Error(`${GET_TATOLAB_COM_URL}/latest answered ${latestResponse.status}`);
  return (await latestResponse.text()).trim();
}

async function streamlibReleaseWithItsLinuxRuntime(version) {
  if (semverParts(version) === null) throw new Error(`not an X.Y.Z streamlib version: ${version}`);
  const linuxRuntimeTarballUrl = `${GET_TATOLAB_COM_URL}/releases/${version}/tatolab-runtime-${version}-x86_64-linux.tar.gz`;
  const tarballResponse = await fetch(linuxRuntimeTarballUrl, { method: "HEAD" });
  if (!tarballResponse.ok) throw new Error(`${linuxRuntimeTarballUrl} answered ${tarballResponse.status}`);
  return { tag: `v${version}`, version, linuxRuntimeTarballUrl };
}

async function lastPublishedAppVersion() {
  const recordResponse = await fetchOrNull(`${GET_TATOLAB_COM_URL}/${PUBLISHED_RELEASE_RECORD_PATH}`, { cache: "no-store" });
  if (recordResponse !== null) return (await recordResponse.json()).app_version;
  const manifestResponse = await fetchOrNull(`${GET_TATOLAB_COM_URL}/app/latest-mac.yml`, { cache: "no-store" });
  return manifestResponse === null ? null : versionOfTheUpdateManifest(await manifestResponse.text());
}

async function main() {
  const requestedStreamlibVersion = (process.argv[2] ?? "").trim();
  const streamlibRelease = await streamlibReleaseWithItsLinuxRuntime(
    requestedStreamlibVersion === "" ? await streamlibVersionServedAsLatest() : requestedStreamlibVersion,
  );
  const plan = planTatolabAppRelease({ streamlibVersion: streamlibRelease.version, publishedAppVersion: await lastPublishedAppVersion() });
  const outputs = {
    app_version: plan.appVersion,
    streamlib_tag: streamlibRelease.tag,
    streamlib_version: streamlibRelease.version,
    linux_runtime_tarball_url: streamlibRelease.linuxRuntimeTarballUrl,
  };
  const outputLines = `${Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join("\n")}\n`;
  process.stdout.write(outputLines);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, outputLines);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
