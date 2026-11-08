// Decides what the release workflow ships: the streamlib release the app bundles (the one
// get.tatolab.com serves as `latest`, with its Linux runtime tarball), whether this run releases at all, and the app version it
// releases as. A merge to main and a dispatch always release; the scheduled run releases only when
// streamlib has released since the app last shipped. The app version is the bundled runtime's when
// that is newer than every app version shipped, and otherwise the last shipped app version's next
// patch, so every release is newer than the last and the updaters take it.
//
// Usage: node scripts/plan_tatolab_app_release.mjs <push|schedule|workflow_dispatch>
//   GITHUB_OUTPUT  where the plan is written as step outputs; printed when unset
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
 * The plan for one run: `trigger` is the workflow's event, `streamlibVersion` the streamlib release to bundle, and
 * `publishedRelease` the last release the feed shipped (`{ appVersion, streamlibVersion }`, its streamlib `null` when
 * the feed predates the record), or `null` when the feed has shipped nothing.
 */
export function planTatolabAppRelease({ trigger, streamlibVersion, publishedRelease }) {
  if (publishedRelease === null) return { shouldRelease: true, appVersion: streamlibVersion, reason: "the feed has shipped no app yet" };
  if (trigger === "schedule" && publishedRelease.streamlibVersion === streamlibVersion) {
    return { shouldRelease: false, appVersion: publishedRelease.appVersion, reason: `the feed already ships streamlib ${streamlibVersion}` };
  }
  const nextPatch = nextPatchOf(publishedRelease.appVersion);
  const appVersion = compareSemver(streamlibVersion, nextPatch) >= 0 ? streamlibVersion : nextPatch;
  const reason = trigger === "schedule" ? `streamlib released ${streamlibVersion}` : `${trigger} to main`;
  return { shouldRelease: true, appVersion, reason };
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

async function streamlibReleaseServedAsLatest() {
  const latestResponse = await fetch(`${GET_TATOLAB_COM_URL}/latest`, { cache: "no-store" });
  if (!latestResponse.ok) throw new Error(`${GET_TATOLAB_COM_URL}/latest answered ${latestResponse.status}`);
  const version = (await latestResponse.text()).trim();
  if (semverParts(version) === null) throw new Error(`${GET_TATOLAB_COM_URL}/latest names no X.Y.Z version: ${version}`);
  const linuxRuntimeTarballUrl = `${GET_TATOLAB_COM_URL}/releases/${version}/tatolab-runtime-${version}-x86_64-linux.tar.gz`;
  const tarballResponse = await fetch(linuxRuntimeTarballUrl, { method: "HEAD" });
  if (!tarballResponse.ok) throw new Error(`${linuxRuntimeTarballUrl} answered ${tarballResponse.status}`);
  return { tag: `v${version}`, version, linuxRuntimeTarballUrl };
}

async function lastPublishedRelease() {
  const recordResponse = await fetchOrNull(`${GET_TATOLAB_COM_URL}/${PUBLISHED_RELEASE_RECORD_PATH}`, { cache: "no-store" });
  if (recordResponse !== null) {
    const record = await recordResponse.json();
    return { appVersion: record.app_version, streamlibVersion: record.streamlib_version };
  }
  const manifestResponse = await fetchOrNull(`${GET_TATOLAB_COM_URL}/app/latest-mac.yml`, { cache: "no-store" });
  if (manifestResponse === null) return null;
  const appVersion = versionOfTheUpdateManifest(await manifestResponse.text());
  return appVersion === null ? null : { appVersion, streamlibVersion: null };
}

async function main() {
  const trigger = process.argv[2];
  if (!["push", "schedule", "workflow_dispatch"].includes(trigger ?? "")) {
    process.stderr.write("usage: plan_tatolab_app_release.mjs <push|schedule|workflow_dispatch>\n");
    process.exit(2);
  }
  const streamlibRelease = await streamlibReleaseServedAsLatest();
  const publishedRelease = await lastPublishedRelease();
  const plan = planTatolabAppRelease({ trigger, streamlibVersion: streamlibRelease.version, publishedRelease });
  const outputs = {
    should_release: String(plan.shouldRelease),
    app_version: plan.appVersion,
    streamlib_tag: streamlibRelease.tag,
    streamlib_version: streamlibRelease.version,
    linux_runtime_tarball_url: streamlibRelease.linuxRuntimeTarballUrl,
  };
  const outputLines = `${Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join("\n")}\n`;
  process.stdout.write(`${plan.reason}\n${outputLines}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, outputLines);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
