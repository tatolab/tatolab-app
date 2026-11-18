import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { cleanUpTheFakesTheLastTestMade, commandHandlersOver, FROM_THE_PROJECTS_WINDOW, sharedStateOverFakes } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

test("The Projects window's commands list no recent project on a fresh install, and open only a recent one", async () => {
  const commandHandlers = commandHandlersOver(await sharedStateOverFakes([], "linux"));
  expect(await commandHandlers.read_recent_projects(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: [] });
  expect(await commandHandlers.open_recent_project({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^open_recent_project: /) });
  expect(await commandHandlers.open_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
});

test("A recent project's ⋯ commands and Import project .zip… read their arguments as the window sends them, and change only a recent project", async () => {
  const commandHandlers = commandHandlersOver(await sharedStateOverFakes([], "linux"));
  expect(await commandHandlers.rename_recent_project({ name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^rename_recent_project: /) });
  expect(await commandHandlers.rename_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^rename_recent_project: /) });
  expect(await commandHandlers.rename_recent_project({ folder: "/etc", name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.duplicate_recent_project({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^duplicate_recent_project: /) });
  expect(await commandHandlers.duplicate_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.delete_recent_project({ folder: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^delete_recent_project: /) });
  expect(await commandHandlers.delete_recent_project({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.choose_project_archive_to_import(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.import_project_archive({ name: "Show", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^import_project_archive: /) });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^import_project_archive: /) });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^import_project_archive: /) });
  expect(await commandHandlers.import_project_archive({ archive: "/tmp/a.zip", name: "a/b", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "A project's name can't hold a /." });
});

test("The Project details panel's commands read their arguments as the window sends them, and change only a recent project", async () => {
  const commandHandlers = commandHandlersOver(await sharedStateOverFakes([], "linux"));
  expect(await commandHandlers.read_recent_project_cover({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^read_recent_project_cover: /) });
  expect(await commandHandlers.read_recent_project_cover({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.set_recent_project_description({ description: "A show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^set_recent_project_description: /) });
  expect(await commandHandlers.set_recent_project_description({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^set_recent_project_description: /) });
  expect(await commandHandlers.set_recent_project_description({ folder: "/etc", description: "A show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
  expect(await commandHandlers.choose_project_cover_image(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.set_recent_project_cover({ image: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^set_recent_project_cover: /) });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^set_recent_project_cover: /) });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc", image: 7 }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^set_recent_project_cover: /) });
  expect(await commandHandlers.set_recent_project_cover({ folder: "/etc", image: null }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/etc is not one of the recent projects." });
});

test("New project's commands suggest an untitled project in Documents/Tato Studio and read their arguments as the window sends them", async () => {
  const sharedState = await sharedStateOverFakes([], "linux");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);
  const readDefaults = await commandHandlers.read_new_project_defaults(undefined, FROM_THE_PROJECTS_WINDOW);
  expect(readDefaults).toMatchObject({ ok: true, value: { name: "Untitled project" } });
  expect(readDefaults.ok && readDefaults.value.location.endsWith(path.join("Documents", "Tato Studio"))).toBe(true);
  expect(await commandHandlers.choose_project_folder({ chosen_for: "new_project" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^choose_project_folder: /) });
  expect(await commandHandlers.choose_new_project_location({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^choose_new_project_location: /) });
  expect(await commandHandlers.choose_new_project_location({ starting_at: "/Users/someone" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.create_new_project({ location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^create_new_project: /) });
  expect(await commandHandlers.create_new_project({ name: "Show" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^create_new_project: /) });
  expect(await commandHandlers.create_new_project({ name: "a/b", location: "/tmp" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "A project's name can't hold a /." });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
});
