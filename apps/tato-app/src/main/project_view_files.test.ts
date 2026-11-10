import { expect, test } from "vitest";
import {
  answerAProjectViewFileRequest,
  contentTypeOfAProjectViewFile,
  connectSourcesOfTheViewsManifest,
  projectViewContentSecurityPolicy,
  projectViewFileOfTheRequest,
  projectViewFolderUrl,
  type ProjectViewFilesSources,
} from "./project_view_files.js";
import { failedWith, succeeded } from "./result.js";

const NIGHT_SHOW = "/home/sam/streams/night-show";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("a view's folder is served on an origin of its own, naming the open project, and a request in it names the file in the project", () => {
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "views/deck");
  const meterFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "imports/lobby-wall/views/meter");

  expect(deckFolderUrl).toBe("tatolab-view://b7367fe6014d7320b5371f419aad47f0/L2hvbWUvc2FtL3N0cmVhbXMvbmlnaHQtc2hvdw/views/deck/");
  expect(new URL(meterFolderUrl).host).not.toBe(new URL(deckFolderUrl).host);
  expect(new URL(projectViewFolderUrl("/home/sam/streams/other", "views/deck")).host).not.toBe(new URL(deckFolderUrl).host);
  expect(projectViewFileOfTheRequest(new URL("index.html", deckFolderUrl).href)).toEqual({ open_project_folder: NIGHT_SHOW, view_folder_in_the_project: "views/deck", path_in_the_project: "views/deck/index.html" });
  expect(projectViewFileOfTheRequest(new URL("assets/app.js?v=2", meterFolderUrl).href)).toEqual({
    open_project_folder: NIGHT_SHOW,
    view_folder_in_the_project: "imports/lobby-wall/views/meter",
    path_in_the_project: "imports/lobby-wall/views/meter/assets/app.js",
  });
});

test("a request outside a view folder, climbing out of one, naming a project folder that is not absolute, or on another view's origin names no file", () => {
  const encodedNightShow = Buffer.from(NIGHT_SHOW).toString("base64url");
  const originOfTheViewFolder = (viewFolder: string) => `tatolab-view://${new URL(projectViewFolderUrl(NIGHT_SHOW, viewFolder)).host}`;
  const deckOrigin = originOfTheViewFolder("views/deck");
  const meterOrigin = originOfTheViewFolder("imports/lobby-wall/views/meter");
  expect(projectViewFileOfTheRequest(`${deckOrigin}/${encodedNightShow}/views/deck/index.html`)).not.toBeNull();
  for (const requestUrl of [
    `${deckOrigin}/${encodedNightShow}/nodes/camera.py`,
    `${deckOrigin}/${encodedNightShow}/tatolab-project.json`,
    `${deckOrigin}/${encodedNightShow}/views/deck/%2E%2E/%2E%2E/nodes/camera.py`,
    `${deckOrigin}/${encodedNightShow}/views/deck%2F..%2F..%2Fnodes/camera.py`,
    `${deckOrigin}/${Buffer.from("streams/night-show").toString("base64url")}/views/deck/index.html`,
    `${deckOrigin}/${encodedNightShow}`,
    `${deckOrigin}/${encodedNightShow}/views/mixer/index.html`,
    `${meterOrigin}/${encodedNightShow}/views/deck/index.html`,
    `${deckOrigin}/${Buffer.from("/home/sam/streams/other").toString("base64url")}/views/deck/index.html`,
    `tatolab-app://app/project_views/${encodedNightShow}/views/deck/index.html`,
    `tatolab-app://app/core_views/outliner/index.html`,
    `https://example.com/${encodedNightShow}/views/deck/index.html`,
  ]) {
    expect(projectViewFileOfTheRequest(requestUrl)).toBeNull();
  }
});

test("a view's page loads only from its own origin and frames nothing; a full-access view connects anywhere, a sandboxed one only to the hosts it lists", () => {
  const policyByDirective = (policy: string) => new Map(policy.split("; ").map((directive): [string, string[]] => [directive.split(" ")[0] ?? "", directive.split(" ").slice(1)]));
  const fullAccessPolicy = policyByDirective(projectViewContentSecurityPolicy(connectSourcesOfTheViewsManifest({ contract: "1.0", title: "Deck", entry: "index.html", placement: "node" })));
  expect(fullAccessPolicy.get("default-src")).toEqual(["'self'"]);
  expect(fullAccessPolicy.get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  expect(fullAccessPolicy.get("frame-src")).toEqual(["'none'"]);
  expect(fullAccessPolicy.get("object-src")).toEqual(["'none'"]);
  expect(fullAccessPolicy.get("connect-src")).toEqual(["'self'", "*"]);

  const sandboxedManifest = { contract: "1.0", title: "Weather", entry: "index.html", placement: "area", sandbox: true, network: ["api.weather.example", "localhost:8080"] };
  expect(policyByDirective(projectViewContentSecurityPolicy(connectSourcesOfTheViewsManifest(sandboxedManifest))).get("connect-src")).toEqual([
    "'self'",
    "https://api.weather.example",
    "wss://api.weather.example",
    "https://localhost:8080",
    "wss://localhost:8080",
  ]);
  expect(policyByDirective(projectViewContentSecurityPolicy(connectSourcesOfTheViewsManifest({ contract: "9.0" }))).get("connect-src")).toEqual(["'self'"]);
});

test("each file a view's built folder holds is served with its content type, any other as bytes", () => {
  expect(["views/deck/index.html", "views/deck/assets/app.js", "views/deck/icon.png", "views/deck/model.onnx"].map(contentTypeOfAProjectViewFile)).toEqual([
    "text/html; charset=utf-8",
    "text/javascript; charset=utf-8",
    "image/png",
    "application/octet-stream",
  ]);
});

const DECK_PAGE = Buffer.from('<!doctype html><script type="module" src="./deck.js"></script>');
const SANDBOXED_DECK_MANIFEST = Buffer.from(JSON.stringify({ contract: "1.0", title: "Deck", entry: "index.html", placement: "node", sandbox: true, network: ["api.weather.example"] }));

function sourcesOverAnOpenNightShow(filesRead: string[]): ProjectViewFilesSources {
  const filesOfTheProject = new Map([
    ["views/deck/icon.png", PNG_SIGNATURE],
    ["views/deck/index.html", DECK_PAGE],
    ["views/deck/tatolab_view.json", SANDBOXED_DECK_MANIFEST],
  ]);
  return {
    aStudioWindowHoldsTheProjectIn: (projectFolder) => projectFolder === NIGHT_SHOW,
    readProjectFile: async (projectDirectory, filePath) => {
      filesRead.push(`${projectDirectory} ${filePath}`);
      const fileBytes = filesOfTheProject.get(filePath);
      return fileBytes === undefined ? failedWith(`read_project_file failed: \`${filePath}\` is not a file of the project`) : succeeded(fileBytes);
    },
  };
}

test("a view's file is served from the bytes the runtime reads, only for a project a studio window holds open, a missing one with the runtime's words", async () => {
  const filesRead: string[] = [];
  const sources = sourcesOverAnOpenNightShow(filesRead);
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "views/deck");

  expect(await answerAProjectViewFileRequest(new URL("icon.png", deckFolderUrl).href, sources)).toEqual({
    kind: "served",
    content_type: "image/png",
    content_security_policy: projectViewContentSecurityPolicy([]),
    file_bytes: PNG_SIGNATURE,
  });
  expect(await answerAProjectViewFileRequest(new URL("missing.js", deckFolderUrl).href, sources)).toEqual({
    kind: "not_served",
    status: 404,
    because: "read_project_file failed: `views/deck/missing.js` is not a file of the project",
  });
  expect(await answerAProjectViewFileRequest(new URL("icon.png", projectViewFolderUrl("/home/sam/streams/other", "views/deck")).href, sources)).toEqual({
    kind: "not_served",
    status: 403,
    because: "/home/sam/streams/other is not a project open in a studio window.",
  });
  expect(filesRead).toEqual([`${NIGHT_SHOW} views/deck/icon.png`, `${NIGHT_SHOW} views/deck/missing.js`]);
});

test("a view's page is served under the policy its manifest, as the runtime reads it, calls for", async () => {
  const filesRead: string[] = [];
  const pageAnswer = await answerAProjectViewFileRequest(new URL("index.html", projectViewFolderUrl(NIGHT_SHOW, "views/deck")).href, sourcesOverAnOpenNightShow(filesRead));

  expect(pageAnswer).toEqual({
    kind: "served",
    content_type: "text/html; charset=utf-8",
    content_security_policy: projectViewContentSecurityPolicy(["https://api.weather.example", "wss://api.weather.example"]),
    file_bytes: DECK_PAGE,
  });
  expect(filesRead).toEqual([`${NIGHT_SHOW} views/deck/index.html`, `${NIGHT_SHOW} views/deck/tatolab_view.json`]);
});
