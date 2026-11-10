import { expect, test } from "vitest";
import { answerAProjectViewFileRequest, contentTypeOfAProjectViewFile, projectViewFileOfTheRequest, projectViewFolderUrl, type ProjectViewFilesSources } from "./project_view_files.js";
import { failedWith, succeeded } from "./result.js";

const NIGHT_SHOW = "/home/sam/streams/night-show";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("a view's folder is served under the window page's scheme, naming the open project, and a request in it names the file in the project", () => {
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "views/deck");
  const meterFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "imports/lobby-wall/views/meter");

  expect(deckFolderUrl).toBe("tatolab-app://app/project_views/L2hvbWUvc2FtL3N0cmVhbXMvbmlnaHQtc2hvdw/views/deck/");
  expect(projectViewFileOfTheRequest(new URL("index.html", deckFolderUrl).href)).toEqual({ open_project_folder: NIGHT_SHOW, path_in_the_project: "views/deck/index.html" });
  expect(projectViewFileOfTheRequest(new URL("assets/app.js?v=2", meterFolderUrl).href)).toEqual({
    open_project_folder: NIGHT_SHOW,
    path_in_the_project: "imports/lobby-wall/views/meter/assets/app.js",
  });
});

test("a request outside a view folder, climbing out of one, or naming a project folder that is not absolute names no file", () => {
  const encodedNightShow = Buffer.from(NIGHT_SHOW).toString("base64url");
  for (const requestUrl of [
    `tatolab-app://app/project_views/${encodedNightShow}/nodes/camera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/tatolab-project.json`,
    `tatolab-app://app/project_views/${encodedNightShow}/views/deck/%2E%2E/%2E%2E/nodes/camera.py`,
    `tatolab-app://app/project_views/${encodedNightShow}/views/deck%2F..%2F..%2Fnodes/camera.py`,
    `tatolab-app://app/project_views/${Buffer.from("streams/night-show").toString("base64url")}/views/deck/index.html`,
    `tatolab-app://app/project_views/${encodedNightShow}`,
    `tatolab-app://app/core_views/outliner/index.html`,
    `https://example.com/project_views/${encodedNightShow}/views/deck/index.html`,
  ]) {
    expect(projectViewFileOfTheRequest(requestUrl)).toBeNull();
  }
});

test("each file a view's built folder holds is served with its content type, any other as bytes", () => {
  expect(["views/deck/index.html", "views/deck/assets/app.js", "views/deck/icon.png", "views/deck/model.onnx"].map(contentTypeOfAProjectViewFile)).toEqual([
    "text/html; charset=utf-8",
    "text/javascript; charset=utf-8",
    "image/png",
    "application/octet-stream",
  ]);
});

function sourcesOverAnOpenNightShow(filesRead: string[]): ProjectViewFilesSources {
  return {
    aStudioWindowHoldsTheProjectIn: (projectFolder) => projectFolder === NIGHT_SHOW,
    readProjectFile: async (projectDirectory, filePath) => {
      filesRead.push(`${projectDirectory} ${filePath}`);
      return filePath === "views/deck/icon.png" ? succeeded(PNG_SIGNATURE) : failedWith(`read_project_file failed: \`${filePath}\` is not a file of the project`);
    },
  };
}

test("a view's file is served from the bytes the runtime reads, only for a project a studio window holds open, a missing one with the runtime's words", async () => {
  const filesRead: string[] = [];
  const sources = sourcesOverAnOpenNightShow(filesRead);
  const deckFolderUrl = projectViewFolderUrl(NIGHT_SHOW, "views/deck");

  expect(await answerAProjectViewFileRequest(new URL("icon.png", deckFolderUrl).href, sources)).toEqual({ kind: "served", content_type: "image/png", file_bytes: PNG_SIGNATURE });
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
