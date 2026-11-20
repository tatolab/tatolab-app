// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountedWindowOverTheMock, textOf, systemMenuBarOverTheMock, chooseFromTheMenuBar, openSettingsOn, settingsRow, PULSE_STAGE_FOLDER, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

afterEach(cleanUpTheWindowsOfEarlierTests);

describe("Settings", () => {
  it("opens on macOS from Tato Studio › Settings… in the system menu bar, after About and Check for Updates…, on Project while a project is open", async () => {
    const { backendChanges, menusShownLast, chooseFromTheSystemMenuBar } = systemMenuBarOverTheMock();
    await mountedWindowOverTheMock("state=running", backendChanges);
    await waitFor(() =>
      expect(menusShownLast()[0]?.entries).toEqual([
        { kind: "command", entry_id: "Tato Studio › About Tato Studio", label: "About Tato Studio", shortcut_hint: null, unavailable_because: null },
        { kind: "command", entry_id: "Tato Studio › Check for Updates…", label: "Check for Updates…", shortcut_hint: null, unavailable_because: null },
        { kind: "separator" },
        { kind: "command", entry_id: "Tato Studio › Settings…", label: "Settings…", shortcut_hint: "⌘,", unavailable_because: null },
        { kind: "separator" },
        { kind: "system_items", system_items: "app_services_hide_and_quit" },
      ]),
    );

    await chooseFromTheSystemMenuBar("Tato Studio › Settings…");
    await waitFor(() => expect(document.querySelector(`[data-settings-page="project"]`)).not.toBeNull());
  });

  it("opens on Linux from Edit › Settings… on Project while a project is open, listing every section under its group beside it", async () => {
    await mountedWindowOverTheMock("platform=linux&state=running");
    await chooseFromTheMenuBar("Edit", /^Settings…/);

    await waitFor(() => expect(document.querySelector(`[data-settings-page="project"]`)).not.toBeNull());
    const sectionList = within(screen.getByRole("navigation", { name: "Settings" }));
    expect(sectionList.getByRole("button", { name: "Project" }).getAttribute("aria-current")).toBe("page");
    expect(sectionList.getAllByRole("button").map((sectionButton) => sectionButton.textContent)).toEqual(["Project", "General", "Developer", "Runtime", "Command line", "About"]);
    expect(sectionList.getByText("This machine")).toBeTruthy();
    expect(sectionList.getByText("This project")).toBeTruthy();
  });

  it("changes the open project's name, description and cover in Settings' Project section", async () => {
    const setRecentProjectDescription = vi.fn<(folder: string, description: string) => Promise<void>>(async () => undefined);
    const renameRecentProject = vi.fn<(folder: string, name: string) => Promise<void>>(async () => undefined);
    const setRecentProjectCover = vi.fn<(folder: string, image: string | null) => Promise<void>>(async () => undefined);
    const chooseProjectCoverImage = vi.fn<() => Promise<string | null>>(async () => "/Users/jonathanf/Pictures/stage.png");
    await mountedWindowOverTheMock("state=running", { setRecentProjectDescription, renameRecentProject, setRecentProjectCover, chooseProjectCoverImage });
    await openSettingsOn("project");
    const projectSettings = await waitFor(() => document.querySelector<HTMLElement>(`[data-project-settings="${PULSE_STAGE_FOLDER}"]`) ?? expect.unreachable("no Project section"));
    const nameField = await waitFor(() => projectSettings.querySelector<HTMLInputElement>("[data-project-details-name]") ?? expect.unreachable("no name field"));
    expect(nameField.value).toBe("Pulse Stage");

    fireEvent.change(nameField, { target: { value: "Lobby Pulse Stage" } });
    fireEvent.keyDown(nameField, { key: "Enter" });
    await waitFor(() => expect(renameRecentProject).toHaveBeenCalledWith(PULSE_STAGE_FOLDER, "Lobby Pulse Stage"));

    const descriptionField = projectSettings.querySelector<HTMLTextAreaElement>("[data-project-details-description]") ?? expect.unreachable("no description field");
    fireEvent.change(descriptionField, { target: { value: "The lobby's light show." } });
    fireEvent.blur(descriptionField);
    await waitFor(() => expect(setRecentProjectDescription).toHaveBeenCalledWith(PULSE_STAGE_FOLDER, "The lobby's light show."));

    fireEvent.click(within(projectSettings).getByRole("button", { name: "Choose image…" }));
    await waitFor(() => expect(setRecentProjectCover).toHaveBeenCalledWith(PULSE_STAGE_FOLDER, "/Users/jonathanf/Pictures/stage.png"));
  });

  it("lists no Project section in Settings opened from the Projects window", async () => {
    await mountedWindowOverTheMock("state=running&project=none");
    await waitFor(() => expect(document.querySelectorAll("[data-projects-project]").length).toBeGreaterThan(0));
    fireEvent.keyDown(document, { key: ",", metaKey: true });
    fireEvent.keyDown(document, { key: ",", ctrlKey: true });
    await waitFor(() => expect(document.querySelector('[data-settings-page="general"]')).not.toBeNull());
    expect(document.querySelector('[data-settings-section="project"]')).toBeNull();
    expect(screen.queryByText("This project")).toBeNull();
  });

  it("names the running runtime's version and uptime and its local API socket, and restarts it through Starting", { timeout: 10_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("runtime");

    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Running · tatolabd 0.55.2 · up 3d 2h"));
    expect(within(settingsRow("runtime-logs")).getByText("/Users/jonathanf/Library/Application Support/Tatolab/logs")).toBeTruthy();
    expect(screen.getByText("/tmp/streamlib-501/local-api.sock")).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>("[data-settings-page]") ?? document.body).getByText("jonathanf-macbook")).toBeTruthy();

    fireEvent.click(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }));
    expect(within(settingsRow("runtime-status")).getByRole("button", { name: "Restarting…" })).toBeTruthy();
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Starting"), { timeout: 3_000 });
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toBe("Running · tatolabd 0.55.2 · up less than a minute"), { timeout: 5_000 });
  });

  it("offers no Python to choose: the runtime sets up each project's Python", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("runtime");

    const settingsPage = document.querySelector<HTMLElement>("[data-settings-page]") ?? expect.unreachable("no Settings page");
    expect(document.querySelector('[data-settings-row="python-for-new-environments"]')).toBeNull();
    expect(settingsPage.textContent).not.toMatch(/Python/);
  });

  it("shows a refused restart in the app's words, and offers none while the runtime starts", { timeout: 5_000 }, async () => {
    await mountedWindowOverTheMock("state=running&restart=refused");
    await openSettingsOn("runtime");

    fireEvent.click(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }));

    await waitFor(() =>
      expect(within(settingsRow("runtime-status")).getByRole("alert").textContent).toContain(
        "The runtime running now was not started by Tato Studio, so Tato Studio leaves it alone.",
      ),
    );
    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=starting");
    await openSettingsOn("runtime");
    expect(textOf("[data-runtime-status-words]")).toBe("Starting");
    expect(within(settingsRow("runtime-status")).getByRole("button", { name: "Restart runtime" }).hasAttribute("disabled")).toBe(true);
  });

  it("opens the runtime's log folder, and offers none for a runtime that keeps no log of its own", async () => {
    let logFolderOpenings = 0;
    await mountedWindowOverTheMock("state=running", {
      openRuntimeLogFolder: async () => {
        logFolderOpenings += 1;
      },
    });
    await openSettingsOn("runtime");
    const openLogsFolder = await waitFor(() => {
      const button = within(settingsRow("runtime-logs")).getByRole("button", { name: "Open logs folder" });
      expect(button.hasAttribute("disabled")).toBe(false);
      return button;
    });
    fireEvent.click(openLogsFolder);
    await waitFor(() => expect(logFolderOpenings).toBe(1));

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&runtime_log=none");
    await openSettingsOn("runtime");
    await waitFor(() => expect(textOf("[data-runtime-status-words]")).toContain("tatolabd 0.55.2"));
    expect(within(settingsRow("runtime-logs")).getByRole("button", { name: "Open logs folder" }).hasAttribute("disabled")).toBe(true);
  });

  it("switches stream-failure notifications and opening at login through the backend, and says why where a build can't open at login", async () => {
    const switchesAsked: string[] = [];
    await mountedWindowOverTheMock("state=running", {
      setStreamFailureNotifications: async (enabled) => {
        switchesAsked.push(`notifications ${enabled}`);
      },
      setOpenTatolabAtLogin: async () => {
        throw "Tato Studio could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied";
      },
    });
    await openSettingsOn("general");

    fireEvent.click(within(settingsRow("stream-failure-notifications")).getByRole("switch", { name: "When a stream fails" }));
    await waitFor(() => expect(switchesAsked).toEqual(["notifications false"]));
    const openAtLoginSwitch = within(settingsRow("open-at-login")).getByRole("switch", { name: "Open Tato Studio at login" });
    fireEvent.click(openAtLoginSwitch);
    await waitFor(() =>
      expect(within(settingsRow("open-at-login")).getByRole("alert").textContent).toContain(
        "Tato Studio could not write /home/u/.config/autostart/Tatolab.desktop: EACCES: permission denied",
      ),
    );
    expect(openAtLoginSwitch.getAttribute("aria-checked")).toBe("false");

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&open_at_login=not_offered");
    await openSettingsOn("general");
    expect(within(settingsRow("open-at-login")).queryByRole("switch")).toBeNull();
    expect(within(settingsRow("open-at-login")).getByText("Only a packaged Tato Studio opens at login.")).toBeTruthy();
  });

  it("lists Developer under App and switches Developer mode on through the backend, off by default", async () => {
    const switchesAsked: boolean[] = [];
    await mountedWindowOverTheMock("state=running", {
      setDeveloperMode: async (enabled) => {
        switchesAsked.push(enabled);
      },
    });
    await openSettingsOn("developer");

    const developerModeSwitch = within(settingsRow("developer-mode")).getByRole("switch", { name: "Developer mode" });
    expect(developerModeSwitch.getAttribute("aria-checked")).toBe("false");
    expect(within(settingsRow("developer-mode")).getByText(/Adds the Transactions view/)).toBeTruthy();
    fireEvent.click(developerModeSwitch);
    await waitFor(() => expect(switchesAsked).toEqual([true]));

    document.body.replaceChildren();
    await mountedWindowOverTheMock("state=running&developer_mode=on");
    await openSettingsOn("developer");
    expect(within(settingsRow("developer-mode")).getByRole("switch", { name: "Developer mode" }).getAttribute("aria-checked")).toBe("true");
  });

  it("goes back to the status's position when the backend accepts a switch and no status follows", { timeout: 8_000 }, async () => {
    await mountedWindowOverTheMock("state=running", { setStreamFailureNotifications: async () => {} });
    await openSettingsOn("general");
    const notificationsSwitch = within(settingsRow("stream-failure-notifications")).getByRole("switch", { name: "When a stream fails" });

    fireEvent.click(notificationsSwitch);
    await waitFor(() => expect(notificationsSwitch.getAttribute("aria-checked")).toBe("false"));

    await waitFor(() => expect(notificationsSwitch.getAttribute("aria-checked")).toBe("true"), { timeout: 5_000 });
  });

  it("colours a runtime that is not running and says why in the app's words", async () => {
    await mountedWindowOverTheMock("state=not-running");
    await openSettingsOn("runtime");

    const statusWords = document.querySelector<HTMLElement>("[data-runtime-status-words]") ?? expect.unreachable("no status words");
    expect(statusWords.textContent).toBe("Not running");
    expect(statusWords.classList.contains("text-danger-text")).toBe(true);
    expect(within(settingsRow("runtime-status")).getByText("The runtime stopped: it exited with status 1. Tato Studio starts it again shortly.")).toBeTruthy();
  });

  it("shows one notice for a runtime older than this Studio, naming both contracts, with the remedy and no update to offer", async () => {
    await mountedWindowOverTheMock("state=running&runtime_age=older");
    await openSettingsOn("runtime");

    const statusWords = document.querySelector<HTMLElement>("[data-runtime-status-words]") ?? expect.unreachable("no status words");
    expect(statusWords.classList.contains("text-warn-text")).toBe(true);
    const notices = settingsRow("runtime-status").querySelectorAll("[data-runtime-of-another-age]");
    expect(notices).toHaveLength(1);
    const notice = within(settingsRow("runtime-status"));
    expect(notice.getByText("The runtime is older than this Studio")).toBeTruthy();
    expect(textOf("[data-runtime-of-another-age-facts]")).toBe("tatolabd 0.55.2 serves control contract 3, revision 0; this Studio needs contract 3, revision 1. Your projects are untouched.");
    expect(document.querySelector("[data-runtime-of-another-age-remedy='quit_the_running_runtime']")).not.toBeNull();
    expect(document.querySelector("[data-runtime-of-another-age-action]")).toBeNull();
  });

  it("offers the app's update in the notice of a runtime newer than this Studio, and checks for one when pressed", async () => {
    await mountedWindowOverTheMock("state=running&runtime_age=newer");
    await openSettingsOn("runtime");

    expect(within(settingsRow("runtime-status")).getByText("This Studio is older than the runtime")).toBeTruthy();
    const updateButton = document.querySelector<HTMLElement>("[data-runtime-of-another-age-action='update_studio']") ?? expect.unreachable("no update offered");
    expect(updateButton.textContent).toBe("Check for Updates…");
    fireEvent.click(updateButton);
    await waitFor(() => expect(document.querySelector("[data-runtime-of-another-age-action='update_studio']")?.textContent).toBe("Checking for Updates…"));
  });

  it("names the tatolab command's path and version, and how a coding agent starts tatolab mcp", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("command-line");

    expect(within(settingsRow("command-line-tool")).getByText("~/.local/bin/tatolab")).toBeTruthy();
    expect(within(settingsRow("command-line-tool")).getByText("0.55.2")).toBeTruthy();
    expect(textOf("[data-command-line-path-line]")).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(textOf("[data-coding-agent-command]")).toContain("tatolab mcp");
    expect(textOf("[data-coding-agent-config]")).toContain('"args": ["mcp"]');
  });

  it("names the app's and the runtime's versions and the runtime's licence in About", async () => {
    await mountedWindowOverTheMock("state=running");
    await openSettingsOn("about");

    await waitFor(() => expect(within(document.querySelector<HTMLElement>("[data-settings-about]") ?? document.body).getByText("Version 0.45.0 · tatolabd 0.55.2")).toBeTruthy());
    expect(screen.getByText(/Runtime licensed GPL-3\.0-only\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check for Updates…" })).toBeTruthy();
  });
});

describe("Settings › Command line › tatolab", () => {
  it("links ~/.local/bin/tatolab with no password, then shows the link and the PATH line", async () => {
    await mountedWindowOverTheMock("state=running&cli_link=not_linked");
    await openSettingsOn("command-line");

    expect(settingsRow("command-line-tool").textContent).toContain("No password is asked.");
    expect(document.querySelector("[data-command-line-path-line]")).toBeNull();
    fireEvent.click(within(settingsRow("command-line-tool")).getByRole("button", { name: "Link tatolab" }));
    await waitFor(() => expect(within(settingsRow("command-line-tool")).getByText("~/.local/bin/tatolab")).toBeTruthy());
    expect(textOf("[data-command-line-path-line]")).toContain('export PATH="$HOME/.local/bin:$PATH"');
    expect(within(settingsRow("command-line-tool")).queryByRole("button", { name: "Link tatolab" })).toBeNull();
  });

  it("leaves a name something else holds alone and offers no link", async () => {
    await mountedWindowOverTheMock("state=running&cli_link=taken");
    await openSettingsOn("command-line");

    expect(settingsRow("command-line-tool").textContent).toContain("is not a link to Tatolab, so Tato Studio leaves it alone.");
    expect(within(settingsRow("command-line-tool")).queryByRole("button", { name: "Link tatolab" })).toBeNull();
  });
});
