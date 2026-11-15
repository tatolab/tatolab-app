import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { tatolabWindowCommandHandlers } from "./tatolab_commands.js";
import { cleanUpTheFakesTheLastTestMade, FROM_THE_PROJECTS_WINDOW, sharedStateOverFakes } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

test("The Projects window's commands list no recent project on a fresh install, and open only a recent one", async () => {
  const commandHandlers = tatolabWindowCommandHandlers(await sharedStateOverFakes([], "linux"), () => {});
  expect(await commandHandlers.read_recent_projects(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: [] });
  expect(await commandHandlers.open_recent_project({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "open_recent_project needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.open_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
});

test("A recent project's ⋯ commands and Import project .zip… read their arguments as the window sends them, and change only a recent project", async () => {
  const commandHandlers = tatolabWindowCommandHandlers(await sharedStateOverFakes([], "linux"), () => {});
  expect(await commandHandlers.rename_recent_project({ name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "rename_recent_project needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.rename_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "rename_recent_project needs `name`, the project's new name" });
  expect(await commandHandlers.rename_recent_project({ folder: "/etc", name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.duplicate_recent_project({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "duplicate_recent_project needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.duplicate_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.delete_recent_project({ folder: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "delete_recent_project needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.delete_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.choose_project_archive_to_import(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.import_project_archive({ name: "Show", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "import_project_archive needs `archive`, the project .zip chosen in the dialog" });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "import_project_archive needs `name`, the imported project's name" });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "import_project_archive needs `location`, the folder the project goes in" });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", name: "a/b", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "A project's name can't hold a /." });
});

test("The Project details panel's commands read their arguments as the window sends them, and change only a recent project", async () => {
  const commandHandlers = tatolabWindowCommandHandlers(await sharedStateOverFakes([], "linux"), () => {});
  expect(await commandHandlers.read_recent_project_cover({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "read_recent_project_cover needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.read_recent_project_cover({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.set_recent_project_description({ description: "A show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_description needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.set_recent_project_description({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_description needs `description`, what the project is, blank to clear it" });
  expect(await commandHandlers.set_recent_project_description({ folder: "/etc", description: "A show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.choose_project_cover_image(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.set_recent_project_cover({ image: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_cover needs `folder`, one of the recent projects' folders" });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_cover needs `image`, the full path of an image, or null for the plain cover" });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc", image: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "set_recent_project_cover needs `image`, the full path of an image, or null for the plain cover" });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc", image: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
});

test("New project's commands suggest an untitled project in Documents/Tato Studio and read their arguments as the window sends them", async () => {
  const sharedState = await sharedStateOverFakes([], "linux");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = tatolabWindowCommandHandlers(sharedState, () => {});
  const readDefaults = await commandHandlers.read_new_project_defaults(undefined, FROM_THE_PROJECTS_WINDOW);
  expect(readDefaults).toMatchObject({ ok: true, value: { name: "Untitled project" } });
  expect(readDefaults.ok && readDefaults.value.location.endsWith(path.join("Documents", "Tato Studio"))).toBe(true);
  expect(await commandHandlers.choose_project_folder({ chosen_for: "new_project" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "choose_project_folder needs `chosen_for`, project_to_open" });
  expect(await commandHandlers.choose_new_project_location({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "choose_new_project_location needs `starting_at`, the folder the dialog opens in" });
  expect(await commandHandlers.choose_new_project_location({ starting_at: "/Users/someone" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.create_new_project({ location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "create_new_project needs `name`, the new project's name" });
  expect(await commandHandlers.create_new_project({ name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "create_new_project needs `location`, the full path of the folder it goes in" });
  expect(await commandHandlers.create_new_project({ name: "a/b", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "A project's name can't hold a /." });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
});
