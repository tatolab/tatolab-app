// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "../../mock/mock_tatolab_backend";
import { mountedWindowOverTheMock, textOf, cleanUpTheWindowsOfEarlierTests } from "./tatolab_window_view_test_support";

// Monaco left in the page listens on the document's body and rejects on events of every later test, so
// Code's editor here says Monaco didn't load; the code pane's text and saves are tested beside it.
vi.mock("@tatolab/tato-app-view-sdk/design_system/support/code_text_editor_monaco", () => {
  throw new Error("Monaco is not loaded in the window's tests.");
});

afterEach(cleanUpTheWindowsOfEarlierTests);

describe("the window's first status", () => {
  it("is announced once, when the first contentful paint is presented after it is in the page, and never again for a later status", async () => {
    let presentTheFirstContentfulPaint: () => void = () => expect.unreachable("nothing observed the paints");
    vi.stubGlobal(
      "PerformanceObserver",
      class {
        constructor(paintCallback: (paintEntries: { getEntriesByName(paintName: string): unknown[] }) => void) {
          presentTheFirstContentfulPaint = () => paintCallback({ getEntriesByName: (paintName) => (paintName === "first-contentful-paint" ? [{}] : []) });
        }
        observe() {}
        disconnect() {
          presentTheFirstContentfulPaint = () => undefined;
        }
      },
    );
    const studioShownAtEachAnnouncement: boolean[] = [];
    const { showStatusAsTheBackendWould, backend } = await mountedWindowOverTheMock("state=running", {}, () =>
      studioShownAtEachAnnouncement.push(document.querySelector("[data-studio-window]") !== null),
    );

    expect(studioShownAtEachAnnouncement).toEqual([]);
    presentTheFirstContentfulPaint();
    expect(studioShownAtEachAnnouncement).toEqual([true]);
    await showStatusAsTheBackendWould(await backend.getTatolabStatus());
    presentTheFirstContentfulPaint();

    expect(studioShownAtEachAnnouncement).toEqual([true]);
  });
});

describe("opening the window", () => {
  it("opens on the Projects window, with no setup screen, while the runtime runs, starts or is not running", async () => {
    for (const pageQuery of ["state=running&project=none", "state=starting&project=none", "state=not-running&project=none", "platform=linux&state=starting&project=none"]) {
      await mountedWindowOverTheMock(pageQuery);
      await waitFor(() => expect(document.querySelector("[data-projects]")).not.toBeNull());
      expect(document.body.textContent).not.toContain("Getting set up");
      expect(document.body.textContent).not.toContain("Install the Tatolab runtime");
      document.body.replaceChildren();
    }
  });
});

describe("the update dialog", () => {
  it("says a downloaded version is ready over the Projects window, holds focus on Cancel, and Install Update answers it and opens Settings › About", async () => {
    const answersGiven: string[] = [];
    const mockBackend = createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams("state=running&project=none&update=ready")));
    await mountedWindowOverTheMock("state=running&project=none&update=ready", {
      answerTheAppUpdateAnnouncement: (kind, version, answer) => {
        answersGiven.push(`${kind} ${version} ${answer}`);
        return mockBackend.answerTheAppUpdateAnnouncement(kind, version, answer);
      },
    });

    const updateDialog = await screen.findByRole("dialog", { name: "Tato Studio 0.46.0 is ready to install" });
    expect(within(updateDialog).getByText("Installing it restarts Tato Studio, which stops every stream it runs until you run it again.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Cancel"));
    fireEvent.click(within(updateDialog).getByRole("button", { name: "Install Update" }));

    expect(answersGiven).toEqual(["update_ready 0.46.0 take_its_action"]);
    await waitFor(() => expect(document.querySelector("[data-settings-about]")).not.toBeNull());
  });

  it("says which version the app is now after an update, and OK closes it at once, before the next status", async () => {
    const answersGiven: string[] = [];
    await mountedWindowOverTheMock("state=running&project=none&update=landed", {
      answerTheAppUpdateAnnouncement: async (kind, version, answer) => {
        answersGiven.push(`${kind} ${version} ${answer}`);
      },
    });

    const updateDialog = await screen.findByRole("dialog", { name: "Tato Studio is now version 0.45.0" });
    expect(within(updateDialog).getByText("Each project's dependencies are brought up to date automatically the next time it runs.")).toBeTruthy();
    expect(within(updateDialog).getByRole("button", { name: "Release Notes" })).toBeTruthy();
    fireEvent.click(within(updateDialog).getByRole("button", { name: "OK" }));

    expect(answersGiven).toEqual(["update_landed 0.45.0 dismiss"]);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Tato Studio is now version 0.45.0" })).toBeNull());
  });

  it("shows the window's refusal of an answer in its own words", async () => {
    await mountedWindowOverTheMock("state=running&project=none&update=landed", {
      answerTheAppUpdateAnnouncement: () => Promise.reject("The release notes did not open: no browser"),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Release Notes" }));

    await waitFor(() => expect(textOf("[data-app-update-choice-refusal]")).toContain("The release notes did not open: no browser"));
  });
});
