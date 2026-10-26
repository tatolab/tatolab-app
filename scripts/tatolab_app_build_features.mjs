// Writes the features a build of the app is built with, and reads them back out of a packaged
// app.asar. The main process imports out/main/tatolab_app_build_features.json, so the file this
// writes is both what the app runs with and the marker the bundle checks read.
// src/main/tatolab_app_build_features.json holds the shipping features.
//
// Usage: node scripts/tatolab_app_build_features.mjs write <features.json> [--local-proof-test-root] [--app-update-feed-url URL]
//        node scripts/tatolab_app_build_features.mjs read <app.asar> [--shipping]
//   write                       writes the shipping features, changed by the flags
//   --local-proof-test-root     every machine directory under the local-proof test root; never shipped
//   --app-update-feed-url URL   the app reads its updates from URL; only with --local-proof-test-root
//   read                        prints machineDirectoriesUnderATestRoot=<true|false> and
//                               appUpdateFeedUrl=<URL>, one per line
//   --shipping                  exits 1, naming each, when a feature is not the shipping one
import { extractFile } from "@electron/asar";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildFeaturesPathInTheAsar = "out/main/tatolab_app_build_features.json";
const usage =
  "usage: tatolab_app_build_features.mjs write <features.json> [--local-proof-test-root] [--app-update-feed-url URL]\n" +
  "       tatolab_app_build_features.mjs read <app.asar> [--shipping]\n";

function refuseWithUsage() {
  process.stderr.write(usage);
  process.exit(2);
}

// The features object, or null when the source is not exactly the two features with their types.
function buildFeaturesFromSource(buildFeaturesSource) {
  let parsedBuildFeatures;
  try {
    parsedBuildFeatures = JSON.parse(buildFeaturesSource);
  } catch {
    return null;
  }
  const isExactlyTheTwoFeatures =
    typeof parsedBuildFeatures === "object" &&
    parsedBuildFeatures !== null &&
    Object.keys(parsedBuildFeatures).sort().join(",") === "appUpdateFeedUrl,machineDirectoriesUnderATestRoot" &&
    typeof parsedBuildFeatures.machineDirectoriesUnderATestRoot === "boolean" &&
    typeof parsedBuildFeatures.appUpdateFeedUrl === "string" &&
    URL.canParse(parsedBuildFeatures.appUpdateFeedUrl);
  return isExactlyTheTwoFeatures ? parsedBuildFeatures : null;
}

const shippingBuildFeaturesFile = path.join(repositoryRoot, "src", "main", "tatolab_app_build_features.json");
const shippingBuildFeatures = buildFeaturesFromSource(await readFile(shippingBuildFeaturesFile, "utf8"));
if (shippingBuildFeatures === null || shippingBuildFeatures.machineDirectoriesUnderATestRoot) {
  process.stderr.write(`${shippingBuildFeaturesFile} is not the shipping build features\n`);
  process.exit(1);
}

const [subcommand, targetFile, ...flags] = process.argv.slice(2);
if (targetFile === undefined) refuseWithUsage();

if (subcommand === "write") {
  let localProofTestRoot = false;
  let localAppUpdateFeedUrl = null;
  for (let flagIndex = 0; flagIndex < flags.length; flagIndex += 1) {
    if (flags[flagIndex] === "--local-proof-test-root") {
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
  const writtenBuildFeatures = {
    machineDirectoriesUnderATestRoot: localProofTestRoot,
    appUpdateFeedUrl: localAppUpdateFeedUrl ?? shippingBuildFeatures.appUpdateFeedUrl,
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
    process.stderr.write(`${targetFile}'s ${buildFeaturesPathInTheAsar} is not exactly machineDirectoriesUnderATestRoot (a boolean) and appUpdateFeedUrl (a URL)\n`);
    process.exit(1);
  }
  process.stdout.write(`machineDirectoriesUnderATestRoot=${packagedBuildFeatures.machineDirectoriesUnderATestRoot}\nappUpdateFeedUrl=${packagedBuildFeatures.appUpdateFeedUrl}\n`);
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
