import { createHash } from "node:crypto";
import { cp, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { TATOLAB_MARKETPLACE_IMPORT_PROGRESSED_EVENT } from "../shared/tatolab_electron_bridge_contract.js";
import type { FakeTatolabElectronAppShell } from "./fake_tatolab_electron_app_shell.js";
import { startTatolabApp } from "./main.js";
import {
  aProjectTheDialogAnswers,
  cleanUpTheFakeShellsAndRuntimesTheLastTestStarted,
  FAKE_IMPORT_VERSION,
  FAKE_METER_VIEW_MANIFEST,
  fakeShellOverARuntimeReadingEachProjectsFile,
  MACOS_PLATFORM_ITEMS,
  type FakeProjectFile,
} from "./main_test_support.js";

afterEach(cleanUpTheFakeShellsAndRuntimesTheLastTestStarted);

describe("Module manager", () => {
  async function aStudioWindowOfNightShowImportingLobbyWall(): Promise<{ fakeShell: FakeTatolabElectronAppShell; nightShowFolder: string; lobbyWallFolder: string }> {
    const fakeShell = await fakeShellOverARuntimeReadingEachProjectsFile();
    await startTatolabApp(fakeShell.tatolabElectronAppShell, MACOS_PLATFORM_ITEMS, fakeShell.tatolabAppLog);
    const lobbyWallFolder = await aProjectTheDialogAnswers(fakeShell, "lobby-wall");
    const nightShowFolder = await aProjectTheDialogAnswers(fakeShell, "night-show");
    await cp(lobbyWallFolder, path.join(nightShowFolder, "imports", "lobby-wall"), { recursive: true });
    await writeFile(
      path.join(nightShowFolder, "tatolab-project.json"),
      JSON.stringify({
        project: "uuid-of-night-show",
        name: "night-show",
        dependencies: [{ project: "uuid-of-lobby-wall", folder: "lobby-wall", source: lobbyWallFolder, version: FAKE_IMPORT_VERSION }],
      } satisfies FakeProjectFile),
    );
    await fakeShell.invokeTheCommand("choose_project_folder", { chosen_for: "project_to_open" });
    await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "marketplace", page: null }, 2);
    return { fakeShell, nightShowFolder, lobbyWallFolder };
  }

  test("opens from a studio window in a window of its own beside it, which answers its workspace, and closes with it", async () => {
    const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

    expect(fakeShell.studioWindowsOpen().map(({ title, windowContentsId }) => [title, windowContentsId])).toEqual([
      ["night-show", 2],
      ["Modules and Marketplace · night-show", 3],
    ]);
    expect(fakeShell.records).toContainEqual(
      expect.objectContaining({ asked: "create_main_window", windowContentsId: 3, mainWindowSpecification: expect.objectContaining({ width: 1240, height: 800, minimumWidth: 880, minimumHeight: 580 }) }),
    );
    expect(await fakeShell.invokeTheCommand("read_module_manager_workspace", undefined, 3)).toMatchObject({ ok: true, value: { kind: "read", open_project: { project: { name: "night-show" } } } });
    expect(await fakeShell.invokeTheCommand("read_module_manager_workspace", undefined, 2)).toEqual({ ok: true, value: null });
    expect(await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "marketplace", page: null })).toEqual({ ok: false, refusal: "Only a project's studio window, or a view popped out of it, opens Module manager." });
    expect(await fakeShell.invokeTheCommand("open_module_manager_window", undefined, 2)).toEqual({
      ok: false,
      refusal: "open_module_manager_window needs `shows`, one of added_to_this_project, marketplace, and `page`, a catalog entry's name or null.",
    });

    fakeShell.forgetTheRecords();
    await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "marketplace", page: null }, 2);
    expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "create_main_window")).toEqual([]);

    expect(fakeShell.requestTheCloseOfTheWindow(2)).toBe("let_it_close");
    expect(fakeShell.studioWindowsOpen()).toEqual([]);
  });

  test("answers the section it opened on, and asked again from the studio window comes forward and is told the section, and page, asked", async () => {
    const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

    expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 3)).toEqual({ ok: true, value: { shows: "marketplace", page: null } });
    expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 2)).toEqual({ ok: true, value: null });

    fakeShell.forgetTheRecords();
    expect(await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "added_to_this_project", page: null }, 2)).toEqual({ ok: true, value: null });
    expect(fakeShell.records).toContainEqual(
      expect.objectContaining({ asked: "send_window_event", eventChannel: "tatolab-module-manager-section-asked", eventPayload: { shows: "added_to_this_project", page: null }, windowContentsId: 3 }),
    );
    expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "create_main_window")).toEqual([]);
    expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 3)).toEqual({ ok: true, value: { shows: "added_to_this_project", page: null } });

    expect(await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "marketplace", page: "camera-halftone" }, 2)).toEqual({ ok: true, value: null });
    expect(fakeShell.records).toContainEqual(
      expect.objectContaining({ asked: "send_window_event", eventChannel: "tatolab-module-manager-section-asked", eventPayload: { shows: "marketplace", page: "camera-halftone" }, windowContentsId: 3 }),
    );
    expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 3)).toEqual({ ok: true, value: { shows: "marketplace", page: "camera-halftone" } });
    expect(await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "marketplace", page: 7 }, 2)).toMatchObject({ ok: false });
  });

  test("closed and opened again on another section, answers that section", async () => {
    const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

    expect(fakeShell.requestTheCloseOfTheWindow(3)).toBe("let_it_close");
    expect(await fakeShell.invokeTheCommand("open_module_manager_window", { shows: "added_to_this_project", page: null }, 2)).toEqual({ ok: true, value: null });
    const reopenedWindow = fakeShell.studioWindowsOpen().find(({ title }) => title === "Modules and Marketplace · night-show") ?? expect.unreachable("no Modules and Marketplace window");

    expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, reopenedWindow.windowContentsId)).toEqual({ ok: true, value: { shows: "added_to_this_project", page: null } });
    expect(await fakeShell.invokeTheCommand("read_module_manager_section_last_asked", undefined, 3)).toEqual({ ok: true, value: null });
  });

  test("reads the catalog from get.tatolab.com, and says why where it is not served", async () => {
    const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();

    expect(await fakeShell.invokeTheCommand("read_package_catalog", undefined, 3)).toEqual({
      ok: true,
      value: { kind: "not_read", because: "The catalog at https://get.tatolab.com/catalog/v1.json could not be fetched: the fake shell reaches no network" },
    });
    fakeShell.packageCatalogTextServed = JSON.stringify({ catalog_version: 1, entries: [] });
    expect(await fakeShell.invokeTheCommand("read_package_catalog", undefined, 3)).toEqual({ ok: true, value: { kind: "read", entries: [], unreadable_entry_count: 0 } });
    expect(fakeShell.urlsFetched).toEqual(["https://get.tatolab.com/catalog/v1.json", "https://get.tatolab.com/catalog/v1.json"]);
  });

  test("lists the project's imports as the runtime lists them, each named from its copy with the views its folder brings, and only to a Module manager window", async () => {
    const { fakeShell, nightShowFolder, lobbyWallFolder } = await aStudioWindowOfNightShowImportingLobbyWall();

    expect(await fakeShell.invokeTheCommand("list_workspace_dependencies", { check_for_newer: false }, 3)).toEqual({
      ok: true,
      value: [
        {
          project: "uuid-of-lobby-wall",
          folder: "lobby-wall",
          source: lobbyWallFolder,
          version: FAKE_IMPORT_VERSION,
          folder_path: path.join(nightShowFolder, "imports", "lobby-wall"),
          name: "lobby-wall",
          edited_files: [],
          newer_version_exists: null,
          check_refused_because: null,
          views: { kind: "listed", views: [{ view_type_id: "lobby-wall:meter", manifest_json: FAKE_METER_VIEW_MANIFEST, opens: true, not_opened_because: null }] },
        },
      ],
    });
    expect(await fakeShell.invokeTheCommand("read_open_project", undefined, 2)).toMatchObject({
      ok: true,
      value: { kind: "read", open_project: { project: { name: "night-show", project: "uuid-of-night-show" }, imports: [{ project: "uuid-of-lobby-wall", name: "lobby-wall", folder: "lobby-wall" }] } },
    });
    expect(await fakeShell.invokeTheCommand("list_workspace_dependencies", { check_for_newer: false }, 2)).toEqual({ ok: false, refusal: "Only a Module manager window imports into a project." });
  });

  test("adds the project the dialog answers through the runtime, which the open project then lists, and says the runtime's refusal in its words", async () => {
    const { fakeShell, nightShowFolder } = await aStudioWindowOfNightShowImportingLobbyWall();
    const doorwaysFolder = await aProjectTheDialogAnswers(fakeShell, "doorways");
    fakeShell.dependencySourceTheDialogAnswers = doorwaysFolder;

    expect(await fakeShell.invokeTheCommand("choose_dependency_source", { source_kind: "folder" }, 3)).toEqual({ ok: true, value: doorwaysFolder });
    expect(fakeShell.records).toContainEqual(expect.objectContaining({ asked: "ask_for_a_dependency_source", sourceKind: "folder", defaultFolder: path.dirname(nightShowFolder) }));
    expect(await fakeShell.invokeTheCommand("add_dependency_to_the_workspace", { source: doorwaysFolder }, 3)).toEqual({
      ok: true,
      value: { project: "uuid-of-doorways", folder: "doorways", source: doorwaysFolder, version: FAKE_IMPORT_VERSION },
    });
    expect(await fakeShell.invokeTheCommand("add_dependency_to_the_workspace", { source: doorwaysFolder }, 3)).toEqual({
      ok: false,
      refusal: "add_dependency failed: the project already imports uuid-of-doorways in imports/doorways",
    });
    expect(await fakeShell.invokeTheCommand("add_dependency_to_the_workspace", { source: "doorways" }, 3)).toMatchObject({ ok: false });

    const listed = await fakeShell.invokeTheCommand("list_workspace_dependencies", { check_for_newer: false }, 3);
    expect(listed.ok && Array.isArray(listed.value) && listed.value.map((dependency) => ("folder" in dependency ? dependency.folder : null))).toEqual(["lobby-wall", "doorways"]);
  });

  test("removes an import through the runtime, which the project then no longer lists, says the runtime's refusal in its words, and only for a Module manager window", async () => {
    const { fakeShell, lobbyWallFolder } = await aStudioWindowOfNightShowImportingLobbyWall();

    expect(await fakeShell.invokeTheCommand("remove_workspace_dependency", { project: "uuid-of-lobby-wall" }, 2)).toEqual({ ok: false, refusal: "Only a Module manager window imports into a project." });
    expect(await fakeShell.invokeTheCommand("remove_workspace_dependency", undefined, 3)).toMatchObject({ ok: false, refusal: expect.stringMatching(/^remove_workspace_dependency: /) });
    expect(await fakeShell.invokeTheCommand("remove_workspace_dependency", { project: "uuid-of-lobby-wall" }, 3)).toEqual({
      ok: true,
      value: { project: "uuid-of-lobby-wall", folder: "lobby-wall", source: lobbyWallFolder, version: FAKE_IMPORT_VERSION },
    });
    expect(await fakeShell.invokeTheCommand("remove_workspace_dependency", { project: "uuid-of-lobby-wall" }, 3)).toEqual({
      ok: false,
      refusal: "remove_dependency failed: the project imports no project uuid-of-lobby-wall",
    });
    expect(await fakeShell.invokeTheCommand("list_workspace_dependencies", { check_for_newer: false }, 3)).toEqual({ ok: true, value: [] });
  });

  test("updates an import through the runtime, holding one edited since its copy until the person overwrites it, says the runtime's refusal in its words, and only for a Module manager window", async () => {
    const { fakeShell, lobbyWallFolder } = await aStudioWindowOfNightShowImportingLobbyWall();
    const lobbyWall = { project: "uuid-of-lobby-wall", folder: "lobby-wall", source: lobbyWallFolder, version: FAKE_IMPORT_VERSION };

    expect(await fakeShell.invokeTheCommand("update_workspace_dependency", { project: "uuid-of-lobby-wall", overwrite_edited_files: false }, 3)).toEqual({
      ok: true,
      value: { kind: "edited_since_its_copy", edited_files: ["views/meter/index.html"] },
    });
    expect(await fakeShell.invokeTheCommand("update_workspace_dependency", { project: "uuid-of-lobby-wall", overwrite_edited_files: true }, 3)).toEqual({ ok: true, value: { kind: "updated", dependency: lobbyWall } });
    expect(await fakeShell.invokeTheCommand("update_workspace_dependency", { project: "uuid-of-doorways", overwrite_edited_files: true }, 3)).toEqual({
      ok: false,
      refusal: "update_dependency failed: the project imports no project uuid-of-doorways",
    });
    expect(await fakeShell.invokeTheCommand("update_workspace_dependency", { project: "uuid-of-lobby-wall" }, 3)).toMatchObject({ ok: false, refusal: expect.stringMatching(/^update_workspace_dependency: /) });
    expect(await fakeShell.invokeTheCommand("update_workspace_dependency", { project: "uuid-of-lobby-wall", overwrite_edited_files: true }, 2)).toEqual({ ok: false, refusal: "Only a Module manager window imports into a project." });
  });

  describe("a sample of the Marketplace", () => {
    const HALFTONE_SAMPLE_ZIP_URL = "https://get.tatolab.com/samples/camera-halftone-0.68.29.zip";
    const HALFTONE_SAMPLE_ZIP_BYTES = Buffer.from("the camera-halftone sample's zip");
    const CAMERA_PACKAGE_ZIP_URL = "https://get.tatolab.com/modules/tatolab-camera-0.68.29.zip";

    function serveACatalogOfTheHalftoneSampleAndTheCameraPackage(fakeShell: FakeTatolabElectronAppShell): void {
      const entryNamed = (kind: "package" | "sample", name: string, title: string, downloadUrl: string) => ({
        kind,
        name,
        title,
        summary: "",
        version: "0.68.29",
        download_url: downloadUrl,
        download_sha256: createHash("sha256").update(HALFTONE_SAMPLE_ZIP_BYTES).digest("hex"),
        nodes: [],
        streams: [],
        homepage_url: null,
      });
      fakeShell.packageCatalogTextServed = JSON.stringify({
        catalog_version: 1,
        entries: [entryNamed("sample", "camera-halftone", "Camera halftone", HALFTONE_SAMPLE_ZIP_URL), entryNamed("package", "tatolab-camera", "Camera", CAMERA_PACKAGE_ZIP_URL)],
      });
      fakeShell.bytesServedByUrl.set(HALFTONE_SAMPLE_ZIP_URL, HALFTONE_SAMPLE_ZIP_BYTES);
      fakeShell.bytesServedByUrl.set(CAMERA_PACKAGE_ZIP_URL, HALFTONE_SAMPLE_ZIP_BYTES);
    }

    test("is cloned into a project of its own in <Documents>/Tato Studio, opened in a studio window, and the project it was cloned from imports nothing more", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();
      serveACatalogOfTheHalftoneSampleAndTheCameraPackage(fakeShell);
      const folderOfTheClone = path.join(fakeShell.tatolabElectronAppShell.documentsDirectory, "Tato Studio", "Camera halftone");

      expect(await fakeShell.invokeTheCommand("clone_marketplace_sample", { name: "camera-halftone" }, 3)).toEqual({ ok: true, value: { folder: folderOfTheClone, project_creation: null } });

      expect(fakeShell.urlsFetched).toContain(HALFTONE_SAMPLE_ZIP_URL);
      expect(fakeShell.studioWindowsOpen().map(({ title }) => title)).toEqual(["night-show", "Modules and Marketplace · night-show", "Camera halftone"]);
      const listed = await fakeShell.invokeTheCommand("list_workspace_dependencies", { check_for_newer: false }, 3);
      expect(listed.ok && Array.isArray(listed.value) && listed.value.map((dependency) => ("folder" in dependency ? dependency.folder : null))).toEqual(["lobby-wall"]);
    });

    test("is never added to a project, a package is never cloned, and neither is asked of any window but Module manager", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();
      serveACatalogOfTheHalftoneSampleAndTheCameraPackage(fakeShell);

      expect(await fakeShell.invokeTheCommand("import_from_the_marketplace", { name: "camera-halftone" }, 3)).toEqual({
        ok: false,
        refusal: "Camera halftone is a sample project; clone it into a project of its own instead.",
      });
      expect(await fakeShell.invokeTheCommand("clone_marketplace_sample", { name: "tatolab-camera" }, 3)).toEqual({
        ok: false,
        refusal: "Camera is not a sample project; add it to a project instead.",
      });
      expect(await fakeShell.invokeTheCommand("clone_marketplace_sample", { name: "camera-halftone" }, 2)).toEqual({ ok: false, refusal: "Only a Module manager window imports into a project." });
      expect(await fakeShell.invokeTheCommand("clone_marketplace_sample", undefined, 3)).toMatchObject({ ok: false, refusal: expect.stringMatching(/^clone_marketplace_sample: /) });
      expect(fakeShell.urlsFetched).not.toContain(HALFTONE_SAMPLE_ZIP_URL);
      expect(fakeShell.studioWindowsOpen().map(({ title }) => title)).toEqual(["night-show", "Modules and Marketplace · night-show"]);
    });

    test("a package is added from the project's studio window too, as its node search adds one, and from no other window", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();
      serveACatalogOfTheHalftoneSampleAndTheCameraPackage(fakeShell);

      expect(await fakeShell.invokeTheCommand("import_from_the_marketplace", { name: "tatolab-camera" }, 1)).toEqual({
        ok: false,
        refusal: "Only a project's studio window, a view popped out of it, or its Module manager window imports into the project.",
      });
      expect(fakeShell.urlsFetched).not.toContain(CAMERA_PACKAGE_ZIP_URL);
      const imported = await fakeShell.invokeTheCommand("import_from_the_marketplace", { name: "tatolab-camera" }, 2);
      expect(fakeShell.urlsFetched).toContain(CAMERA_PACKAGE_ZIP_URL);
      // The fake runtime reads a project's file from a folder, never from inside a `.zip`, so it answers the download with add_dependency's refusal.
      expect(imported).toMatchObject({ ok: false, refusal: expect.stringMatching(/^add_dependency failed: .*tatolab-camera-0\.68\.29\.zip holds no tatolab-project\.json$/) });
    });

    test("a package's add tells only the window that asked each stage it reaches, its bytes, the catalog's SHA-256, then its adding; Cancel is refused once none downloads", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();
      serveACatalogOfTheHalftoneSampleAndTheCameraPackage(fakeShell);
      fakeShell.forgetTheRecords();

      await fakeShell.invokeTheCommand("import_from_the_marketplace", { name: "tatolab-camera" }, 3);

      const zipBytes = HALFTONE_SAMPLE_ZIP_BYTES.length;
      expect(fakeShell.records.filter((fakeShellRecord) => fakeShellRecord.asked === "send_window_event" && fakeShellRecord.eventChannel === TATOLAB_MARKETPLACE_IMPORT_PROGRESSED_EVENT)).toEqual([
        { asked: "send_window_event", windowContentsId: 3, eventChannel: TATOLAB_MARKETPLACE_IMPORT_PROGRESSED_EVENT, eventPayload: { name: "tatolab-camera", stage: { kind: "downloading", bytes_read: 0, bytes_total: null } } },
        { asked: "send_window_event", windowContentsId: 3, eventChannel: TATOLAB_MARKETPLACE_IMPORT_PROGRESSED_EVENT, eventPayload: { name: "tatolab-camera", stage: { kind: "downloading", bytes_read: zipBytes, bytes_total: zipBytes } } },
        {
          asked: "send_window_event",
          windowContentsId: 3,
          eventChannel: TATOLAB_MARKETPLACE_IMPORT_PROGRESSED_EVENT,
          eventPayload: { name: "tatolab-camera", stage: { kind: "verifying", sha256: createHash("sha256").update(HALFTONE_SAMPLE_ZIP_BYTES).digest("hex") } },
        },
        { asked: "send_window_event", windowContentsId: 3, eventChannel: TATOLAB_MARKETPLACE_IMPORT_PROGRESSED_EVENT, eventPayload: { name: "tatolab-camera", stage: { kind: "adding" } } },
      ]);
      expect(await fakeShell.invokeTheCommand("cancel_marketplace_import", { name: "tatolab-camera" }, 3)).toEqual({ ok: false, refusal: "No add of tatolab-camera is under way in this window." });
      expect(await fakeShell.invokeTheCommand("cancel_marketplace_import", undefined, 3)).toMatchObject({ ok: false, refusal: expect.stringMatching(/^cancel_marketplace_import: /) });
    });

    test("a package is added from a Stream graph popped out of the project's studio window, as its node search adds one", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();
      serveACatalogOfTheHalftoneSampleAndTheCameraPackage(fakeShell);
      expect(await fakeShell.invokeTheCommand("pop_out_view", { view_type_id: "stream_graph", window_title: "main · Stream graph", pinned_to: null }, 2)).toEqual({ ok: true, value: null });
      const poppedOutWindow = fakeShell.studioWindowsOpen().find(({ title }) => title === "main · Stream graph") ?? expect.unreachable("no popped-out window");

      await fakeShell.invokeTheCommand("import_from_the_marketplace", { name: "tatolab-camera" }, poppedOutWindow.windowContentsId);

      expect(fakeShell.urlsFetched).toContain(CAMERA_PACKAGE_ZIP_URL);
    });

    test("a package whose wheels leave this Mac out is refused before it is downloaded, naming the machines it is built for", async () => {
      const { fakeShell } = await aStudioWindowOfNightShowImportingLobbyWall();
      serveACatalogOfTheHalftoneSampleAndTheCameraPackage(fakeShell);
      fakeShell.packageCatalogTextServed = JSON.stringify({
        catalog_version: 1,
        entries: [
          {
            kind: "package",
            name: "tatolab-camera",
            title: "Camera",
            summary: "",
            version: "0.68.29",
            download_url: CAMERA_PACKAGE_ZIP_URL,
            download_sha256: createHash("sha256").update(HALFTONE_SAMPLE_ZIP_BYTES).digest("hex"),
            platforms: [{ sys_platform: "linux", platform_machine: "x86_64" }],
          },
        ],
      });

      expect(await fakeShell.invokeTheCommand("import_from_the_marketplace", { name: "tatolab-camera" }, 3)).toEqual({
        ok: false,
        refusal: "Camera is built for Linux (x86-64) only, so it brings no node on this computer.",
      });
      expect(fakeShell.urlsFetched).not.toContain(CAMERA_PACKAGE_ZIP_URL);
    });
  });
});
