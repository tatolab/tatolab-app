// Writes the update feed's manifest for one platform, `latest-mac.yml` or `latest-linux.yml`, as
// electron-updater reads it: the version, and each file's URL, sha512 and size. The URLs are
// relative to the feed's `app/` directory, `releases/<version>/<file>` (get.tatolab.com's
// `app/releases/`, beside streamlib's own `releases/`), so one manifest serves
// get.tatolab.com and a local feed laid out the same way.
//
// Usage: node scripts/write_tatolab_app_update_manifest.mjs <manifest path> <X.Y.Z> <file>...
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const [manifestPath, appVersion, ...updateFiles] = process.argv.slice(2);
if (manifestPath === undefined || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(appVersion ?? "") || updateFiles.length === 0) {
  process.stderr.write("usage: write_tatolab_app_update_manifest.mjs <manifest path> <X.Y.Z> <file>...\n");
  process.exit(2);
}

const manifestFiles = [];
for (const updateFile of updateFiles) {
  const fileBytes = await readFile(updateFile);
  manifestFiles.push({
    url: `releases/${appVersion}/${path.basename(updateFile)}`,
    sha512: createHash("sha512").update(fileBytes).digest("base64"),
    size: (await stat(updateFile)).size,
  });
}
const [firstFile] = manifestFiles;
// Every value is a version, a URL of [A-Za-z0-9._/-], base64 or a number, so none needs YAML quoting
// but the date, which would otherwise read as a timestamp.
const manifestLines = [
  `version: ${appVersion}`,
  "files:",
  ...manifestFiles.flatMap((manifestFile) => [`  - url: ${manifestFile.url}`, `    sha512: ${manifestFile.sha512}`, `    size: ${manifestFile.size}`]),
  `path: ${firstFile.url}`,
  `sha512: ${firstFile.sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
];
await writeFile(manifestPath, `${manifestLines.join("\n")}\n`);
process.stdout.write(`${manifestPath}\n`);
