// Writes the features a build of the app is built with, and reads them back out of a packaged
// app.asar. The main process imports out/main/tatolab_app_build_features.json, so the file this
// writes is both what the app runs with and the marker the bundle checks read.
// src/main/tatolab_app_build_features.json holds the shipping features, with no build id.
//
// Usage: node scripts/tatolab_app_build_features.mjs write <features.json> [--release] [--local-proof-test-root] [--app-update-feed-url URL]
//        node scripts/tatolab_app_build_features.mjs read <app.asar> [--shipping]
//   write                       writes the shipping features, changed by the flags, and the build id:
//                               the tatolab-app commit this checkout is at, whether the build is dev
//                               or release, and whether the checkout has uncommitted changes
//   --release                   a build the release workflow makes; every other build is dev
//   --local-proof-test-root     every machine directory under the local-proof test root; never shipped
//   --app-update-feed-url URL   the app reads its updates from URL; only with --local-proof-test-root
//   read                        prints machineDirectoriesUnderATestRoot=<true|false>,
//                               appUpdateFeedUrl=<URL>, tatolabAppCommit=<sha>, buildKind=<dev|release>
//                               and builtWithUncommittedChanges=<true|false>, one per line; exits 1
//                               when the asar carries no build id
//   --shipping                  exits 1, naming each, when a feature is not the shipping one
import { extractFile } from "@electron/asar";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const tatoAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildFeaturesPathInTheAsar = "out/main/tatolab_app_build_features.json";
const usage =
  "usage: tatolab_app_build_features.mjs write <features.json> [--release] [--local-proof-test-root] [--app-update-feed-url URL]\n" +
  "       tatolab_app_build_features.mjs read <app.asar> [--shipping]\n";

function refuseWithUsage() {
  process.stderr.write(usage);
  process.exit(2);
}

function isABuildId(candidateBuildId) {
  return (
    typeof candidateBuildId === "object" &&
    candidateBuildId !== null &&
    Object.keys(candidateBuildId).sort().join(",") === "buildKind,builtWithUncommittedChanges,tatolabAppCommit" &&
    typeof candidateBuildId.tatolabAppCommit === "string" &&
    /^[0-9a-f]{40}$/.test(candidateBuildId.tatolabAppCommit) &&
    (candidateBuildId.buildKind === "dev" || candidateBuildId.buildKind === "release") &&
    typeof candidateBuildId.builtWithUncommittedChanges === "boolean"
  );
}

// The features object, its tatolabAppBuildId null when the source names none, or null when the
// source is not exactly the features with their types.
function buildFeaturesFromSource(buildFeaturesSource) {
  let parsedBuildFeatures;
  try {
    parsedBuildFeatures = JSON.parse(buildFeaturesSource);
  } catch {
    return null;
  }
  if (typeof parsedBuildFeatures !== "object" || parsedBuildFeatures === null) return null;
  const { tatolabAppBuildId = null, ...otherBuildFeatures } = parsedBuildFeatures;
  const isExactlyTheFeatures =
    Object.keys(otherBuildFeatures).sort().join(",") === "appUpdateFeedUrl,machineDirectoriesUnderATestRoot" &&
    typeof otherBuildFeatures.machineDirectoriesUnderATestRoot === "boolean" &&
    typeof otherBuildFeatures.appUpdateFeedUrl === "string" &&
    URL.canParse(otherBuildFeatures.appUpdateFeedUrl) &&
    (tatolabAppBuildId === null || isABuildId(tatolabAppBuildId));
  return isExactlyTheFeatures ? { ...otherBuildFeatures, tatolabAppBuildId } : null;
}

// { buildId } with the commit this checkout is at and whether it has uncommitted changes, untracked
// files that git does not ignore included; { gitRefusal } with git's own words when git cannot say.
async function buildIdOfThisCheckout(buildKind) {
  const runGit = promisify(execFile);
  try {
    const { stdout: headCommitOutput } = await runGit("git", ["-C", tatoAppRoot, "rev-parse", "--verify", "HEAD"]);
    // A tree with many untracked files lists more than execFile's default 1 MiB.
    const { stdout: uncommittedChangesOutput } = await runGit("git", ["-C", tatoAppRoot, "status", "--porcelain"], { maxBuffer: 256 * 1024 * 1024 });
    return { buildId: { tatolabAppCommit: headCommitOutput.trim(), buildKind, builtWithUncommittedChanges: uncommittedChangesOutput.trim() !== "" } };
  } catch (gitFailure) {
    const gitWords = typeof gitFailure.stderr === "string" && gitFailure.stderr.trim() !== "" ? gitFailure.stderr.trim() : gitFailure.message;
    return { gitRefusal: gitWords };
  }
}

const shippingBuildFeaturesFile = path.join(tatoAppRoot, "src", "main", "tatolab_app_build_features.json");
const shippingBuildFeatures = buildFeaturesFromSource(await readFile(shippingBuildFeaturesFile, "utf8"));
if (shippingBuildFeatures === null || shippingBuildFeatures.machineDirectoriesUnderATestRoot || shippingBuildFeatures.tatolabAppBuildId !== null) {
  process.stderr.write(`${shippingBuildFeaturesFile} is not the shipping build features, with a tatolabAppBuildId of null\n`);
  process.exit(1);
}

const [subcommand, targetFile, ...flags] = process.argv.slice(2);
if (targetFile === undefined) refuseWithUsage();

if (subcommand === "write") {
  let releaseBuild = false;
  let localProofTestRoot = false;
  let localAppUpdateFeedUrl = null;
  for (let flagIndex = 0; flagIndex < flags.length; flagIndex += 1) {
    if (flags[flagIndex] === "--release") {
      releaseBuild = true;
    } else if (flags[flagIndex] === "--local-proof-test-root") {
      localProofTestRoot = true;
    } else if (flags[flagIndex] === "--app-update-feed-url" && URL.canParse(flags[flagIndex + 1] ?? "")) {
      localAppUpdateFeedUrl = flags[flagIndex + 1];
      flagIndex += 1;
    } else {
      refuseWithUsage();
    }
  }
  if (localAppUpdateFeedUrl !== null && !localProofTestRoot) {
    process.stderr.write("--app-update-feed-url needs --local-proof-test-root: a shipped app reads its updates only from get.tatolab.com\n");
    process.exit(2);
  }
  if (releaseBuild && localProofTestRoot) {
    process.stderr.write("--release and --local-proof-test-root together: a local-proof build is a dev build\n");
    process.exit(2);
  }
  const checkoutBuildId = await buildIdOfThisCheckout(releaseBuild ? "release" : "dev");
  if (checkoutBuildId.gitRefusal !== undefined) {
    process.stderr.write(
      `git cannot name the commit ${tatoAppRoot} is at, and every build records the tatolab-app commit it was built from: ${checkoutBuildId.gitRefusal}\n`,
    );
    process.exit(1);
  }
  const tatolabAppBuildId = checkoutBuildId.buildId;
  const writtenBuildFeatures = {
    machineDirectoriesUnderATestRoot: localProofTestRoot,
    appUpdateFeedUrl: localAppUpdateFeedUrl ?? shippingBuildFeatures.appUpdateFeedUrl,
    tatolabAppBuildId,
  };
  await writeFile(targetFile, `${JSON.stringify(writtenBuildFeatures, null, 2)}\n`);
} else if (subcommand === "read" && flags.every((flag) => flag === "--shipping")) {
  let packagedBuildFeaturesSource = null;
  try {
    packagedBuildFeaturesSource = extractFile(targetFile, buildFeaturesPathInTheAsar).toString("utf8");
  } catch (extractionFailure) {
    process.stderr.write(`${targetFile} carries no ${buildFeaturesPathInTheAsar}: ${extractionFailure.message}\n`);
    process.exit(1);
  }
  const packagedBuildFeatures = buildFeaturesFromSource(packagedBuildFeaturesSource);
  if (packagedBuildFeatures === null) {
    process.stderr.write(
      `${targetFile}'s ${buildFeaturesPathInTheAsar} is not exactly machineDirectoriesUnderATestRoot (a boolean), appUpdateFeedUrl (a URL) ` +
        "and tatolabAppBuildId (a 40-hex tatolabAppCommit, a buildKind of dev or release, and builtWithUncommittedChanges, a boolean)\n",
    );
    process.exit(1);
  }
  if (packagedBuildFeatures.tatolabAppBuildId === null) {
    process.stderr.write(`${targetFile}'s ${buildFeaturesPathInTheAsar} carries no build id: which tatolab-app commit it was built from is unknown\n`);
    process.exit(1);
  }
  const { tatolabAppCommit, buildKind, builtWithUncommittedChanges } = packagedBuildFeatures.tatolabAppBuildId;
  process.stdout.write(
    `machineDirectoriesUnderATestRoot=${packagedBuildFeatures.machineDirectoriesUnderATestRoot}\nappUpdateFeedUrl=${packagedBuildFeatures.appUpdateFeedUrl}\n` +
      `tatolabAppCommit=${tatolabAppCommit}\nbuildKind=${buildKind}\nbuiltWithUncommittedChanges=${builtWithUncommittedChanges}\n`,
  );
  if (flags.includes("--shipping")) {
    const shippingRefusals = [];
    if (packagedBuildFeatures.machineDirectoriesUnderATestRoot) {
      shippingRefusals.push("was built with machineDirectoriesUnderATestRoot (every machine directory under the local-proof test root)");
    }
    if (packagedBuildFeatures.appUpdateFeedUrl !== shippingBuildFeatures.appUpdateFeedUrl) {
      shippingRefusals.push(`checks ${packagedBuildFeatures.appUpdateFeedUrl} for updates, not ${shippingBuildFeatures.appUpdateFeedUrl}`);
    }
    for (const shippingRefusal of shippingRefusals) process.stderr.write(`${shippingRefusal}\n`);
    if (shippingRefusals.length > 0) process.exit(1);
  }
} else {
  refuseWithUsage();
}
