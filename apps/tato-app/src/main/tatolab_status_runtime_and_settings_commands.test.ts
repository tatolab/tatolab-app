import { afterEach, expect, test, vi } from "vitest";
import { httpResponse, controlOperationResultResponse } from "./fake_local_api_server.js";
import { RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL } from "./carried_runtime_run_as_the_apps_child.js";
import { RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL } from "./runtime_log_folder_opening.js";
import { cleanUpTheFakesTheLastTestMade, commandHandlersOver, FROM_THE_PROJECTS_WINDOW, sharedStateOverFakes } from "./tatolab_commands_test_support.js";

afterEach(cleanUpTheFakesTheLastTestMade);

test("the window asking for the status before the first round waits for it", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux");

  const status = commandHandlersOver(sharedState).get_tatolab_status(undefined, FROM_THE_PROJECTS_WINDOW);
  await sharedState.statusPublisher.refreshAndPublish();

  expect((await status).ok).toBe(true);
});

test("linking the tatolab command asks the link, then observes again, and a refusal reaches the window in its own words", async () => {
  const sharedState = await sharedStateOverFakes([], "macos");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);
  sharedState.commandLineToolLink.commandLineToolLink = { kind: "not_linked", path: "/Users/someone/.local/bin/tatolab" };

  expect(await commandHandlers.link_command_line_tool(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.commandLineToolLink.commandLineToolLink).toEqual({ kind: "linked", path: "/Users/someone/.local/bin/tatolab" });
  expect(refreshRequests).toHaveBeenCalledTimes(1);

  sharedState.commandLineToolLink.linkRefusal = "/Users/someone/.local/bin/tatolab is not a link to Tatolab, so Tato Studio left it alone.";
  expect(await commandHandlers.link_command_line_tool(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "/Users/someone/.local/bin/tatolab is not a link to Tatolab, so Tato Studio left it alone.",
  });
  expect(sharedState.commandLineToolLink.linksAsked).toBe(2);
  expect(refreshRequests).toHaveBeenCalledTimes(2);
});

/** The window's `RuntimeDescription` reads exactly this JSON. */
test("describing_the_runtime_answers_the_window_in_the_contracts_shape_and_a_runtime_that_is_down_in_why", async () => {
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResultResponse({ version: "0.55.2", build_id: "0.55.2+ec6adf522.7f3a91", up_for_ms: 4_000, runtime_log_directory: null, from_later: true }),
      httpResponse("503 Service Unavailable", "text/plain", ""),
    ],
    "macos"
  );
  const commandHandlers = commandHandlersOver(sharedState);

  expect(JSON.stringify(await commandHandlers.describe_runtime(undefined, FROM_THE_PROJECTS_WINDOW))).toBe(
    '{"ok":true,"value":{"version":"0.55.2","build_id":"0.55.2+ec6adf522.7f3a91","up_for_ms":4000,"runtime_log_directory":null}}',
  );
  expect(await commandHandlers.describe_runtime(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: `\`describe_runtime\` to ${sharedState.localApiSocketPath} got no answer: the runtime answered \`describe_runtime\` with HTTP 503: `,
  });
});

test("restarting_the_runtime_stops_the_apps_runtime_to_start_it_again_then_observes_again_and_leaves_one_it_did_not_start_alone", async () => {
  const sharedState = await sharedStateOverFakes(
    [httpResponse("503 Service Unavailable", "text/plain", ""), httpResponse("503 Service Unavailable", "text/plain", "")],
    "linux",
  );
  const commandHandlers = commandHandlersOver(sharedState);
  await sharedState.controller.composeStatus(0);
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");

  expect(await commandHandlers.restart_runtime(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.carriedRuntimeStarts.lastRuntimeStarted()?.askedToStop).toBe(true);
  expect(refreshRequests).toHaveBeenCalledTimes(1);

  const runtimeTheCommandLineStarted = await sharedStateOverFakes([httpResponse("200 OK", "text/plain", "ok")], "linux");
  expect(await commandHandlersOver(runtimeTheCommandLineStarted).restart_runtime(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: RUNTIME_NOT_STARTED_BY_THE_APP_REFUSAL,
  });
  expect(runtimeTheCommandLineStarted.carriedRuntimeStarts.runtimesStarted).toHaveLength(0);
});

test("opening_the_runtimes_log_folder_opens_the_folder_the_runtime_names_and_refuses_a_path_from_the_window", async () => {
  const runtimeLogFolder = "/Users/jonathanf/Library/Application Support/Tatolab/logs";
  const sharedState = await sharedStateOverFakes(
    [
      controlOperationResultResponse({ version: "0.55.2", build_id: "0.55.2+ec6adf522.7f3a91", up_for_ms: 4_000, runtime_log_directory: runtimeLogFolder }),
      controlOperationResultResponse({ version: "0.55.2", build_id: "0.55.2+ec6adf522.7f3a91", up_for_ms: 5_000, runtime_log_directory: null }),
      controlOperationResultResponse({ version: "0.55.2", build_id: "0.55.2+ec6adf522.7f3a91", up_for_ms: 6_000, runtime_log_directory: "/gone/logs" }),
    ],
    "macos",
    [runtimeLogFolder],
  );
  const commandHandlers = commandHandlersOver(sharedState);

  expect(await commandHandlers.open_runtime_log_folder({ folder: "/etc" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^open_runtime_log_folder: /) });
  expect(await commandHandlers.open_runtime_log_folder(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.open_runtime_log_folder(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: RUNTIME_KEEPS_NO_OWN_LOG_REFUSAL });
  expect(await commandHandlers.open_runtime_log_folder(undefined, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: "/gone/logs is not a folder on this machine." });
  expect(sharedState.foldersShownInTheFileManager).toEqual([runtimeLogFolder]);
});

test("turning_stream_failure_notifications_off_is_remembered_shown_in_the_next_status_and_refuses_anything_but_true_or_false", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);

  expect(await commandHandlers.set_stream_failure_notifications({ enabled: false }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(sharedState.streamFailureNotifications.stateNow()).toEqual({ enabled: false, shown_by_this_desktop: true });
  expect(await commandHandlers.set_stream_failure_notifications({ enabled: "no" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: expect.stringMatching(/^set_stream_failure_notifications: /),
  });
});

test("answering_the_update_dialog_takes_its_announcement_away_and_release_notes_opens_the_announced_page_never_one_from_the_window", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const commandHandlers = commandHandlersOver(sharedState);
  sharedState.tatolabAppUpdateAnnouncements.announceTheUpdateLanded("0.69.0");

  expect(
    await commandHandlers.answer_the_app_update_announcement(
      { kind: "update_landed", version: "0.69.0", answer: "take_its_action", release_notes_url: "https://example.com" },
      FROM_THE_PROJECTS_WINDOW,
    ),
  ).toEqual({ ok: true, value: null });
  expect(await commandHandlers.answer_the_app_update_announcement({ kind: "update_landed", version: "0.69.0", answer: "take_its_action" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.webPagesOpenedInTheBrowser).toEqual(["https://github.com/tatolab/tatolab-app/releases/tag/v0.69.0"]);
  expect(sharedState.tatolabAppUpdateAnnouncements.shownAnnouncement()).toBeNull();

  sharedState.tatolabAppUpdateAnnouncements.announceTheUpdateLanded("0.69.1");
  expect(await commandHandlers.answer_the_app_update_announcement({ kind: "update_landed", version: "0.69.1", answer: "dismiss" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.webPagesOpenedInTheBrowser).toHaveLength(1);
  expect(sharedState.tatolabAppUpdateAnnouncements.shownAnnouncement()).toBeNull();
});

test("answering_the_update_dialog_refuses_a_kind_or_an_answer_it_does_not_know", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const commandHandlers = commandHandlersOver(sharedState);

  expect(await commandHandlers.answer_the_app_update_announcement({ kind: "update_gone", version: "0.69.0", answer: "dismiss" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "answer_the_app_update_announcement takes `kind` update_ready or update_landed, not update_gone",
  });
  expect(await commandHandlers.answer_the_app_update_announcement({ kind: "update_ready", version: "0.69.0", answer: "later" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "answer_the_app_update_announcement takes `answer` take_its_action or dismiss, not later",
  });
});

test("dismissing_the_x11_warning_dialog_is_remembered_shown_in_the_next_status_and_refuses_a_kind_it_does_not_know", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "linux");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);
  expect(sharedState.studioWarnings.warningsNow()).toEqual([{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: true }]);

  expect(await commandHandlers.dismiss_the_studio_warning_dialog({ kind: "viewer_frames_copied_on_x11" }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(sharedState.studioWarnings.warningsNow()).toEqual([{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: false }]);
  expect(await commandHandlers.dismiss_the_studio_warning_dialog({ kind: "slow_disk" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: expect.stringMatching(/^dismiss_the_studio_warning_dialog: /),
  });
});

test("turning_developer_mode_on_is_remembered_shown_in_the_next_status_and_refuses_anything_but_true_or_false", async () => {
  const sharedState = await sharedStateOverFakes([httpResponse("503 Service Unavailable", "text/plain", "")], "macos");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);
  expect(sharedState.developerModeSwitch.isOnNow()).toBe(false);

  expect(await commandHandlers.set_developer_mode({ enabled: true }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(refreshRequests).toHaveBeenCalledTimes(1);
  expect(sharedState.developerModeSwitch.isOnNow()).toBe(true);
  expect(await commandHandlers.set_developer_mode({ enabled: "yes" }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: expect.stringMatching(/^set_developer_mode: /),
  });
});

test("opening_tatolab_at_login_asks_the_desktop_then_observes_again_and_is_refused_in_its_words", async () => {
  const sharedState = await sharedStateOverFakes([], "linux");
  const refreshRequests = vi.spyOn(sharedState.statusPublisher, "requestRefresh");
  const commandHandlers = commandHandlersOver(sharedState);

  expect(await commandHandlers.set_open_tatolab_at_login({ enabled: true }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(sharedState.tatolabAppOpenedAtLogin.setsAsked).toEqual([true]);
  expect(refreshRequests).toHaveBeenCalledTimes(1);

  sharedState.tatolabAppOpenedAtLogin.refusal = "Tato Studio could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied";
  expect(await commandHandlers.set_open_tatolab_at_login({ enabled: false }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "Tato Studio could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied",
  });
  expect(await commandHandlers.set_open_tatolab_at_login({}, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: false, refusal: expect.stringMatching(/^set_open_tatolab_at_login: /) });
});

test("a window's menus are kept for the system menu bar on macOS, shown while it is in focus, and menus out of shape are refused", async () => {
  const sharedState = await sharedStateOverFakes([], "macos");
  const commandHandlers = commandHandlersOver(sharedState);
  const fileMenu = {
    label: "File",
    system_menu: null,
    entries: [{ kind: "command", entry_id: "File/Open project…", label: "Open project…", shortcut_hint: "⌘O", unavailable_because: null }],
  };

  sharedState.systemMenuBar.noticeTheWindowFocused(FROM_THE_PROJECTS_WINDOW.windowContentsId);
  expect(await commandHandlers.show_menus_in_the_system_menu_bar({ menus: [fileMenu] }, FROM_THE_PROJECTS_WINDOW)).toEqual({ ok: true, value: null });
  expect(await commandHandlers.show_menus_in_the_system_menu_bar({ menus: [{ ...fileMenu, entries: [{ kind: "command", label: "No id" }] }] }, FROM_THE_PROJECTS_WINDOW)).toEqual({
    ok: false,
    refusal: "show_menus_in_the_system_menu_bar needs `menus`, the window's menus in the system menu bar's shape",
  });

  expect(sharedState.menusShownInTheSystemMenuBar).toEqual([null, [fileMenu]]);
});
