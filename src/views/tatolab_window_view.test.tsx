// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// @vitest-environment happy-dom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMockTatolabBackend, readMockTatolabOptions } from "../backend/mock_tatolab_backend";
import type { TatolabBackend } from "../backend/tatolab_backend";
import type { TatolabStatus, TatolabStreamActionName } from "../backend/tatolab_backend_contract";
import { mountTatolabWindow } from "./tatolab_window_view";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

/** The real window over the mock backend opened with `pageQuery`, mounted the way `main.ts` mounts it. */
async function mountedWindowOverTheMock(pageQuery: string, backendChanges: Partial<TatolabBackend> = {}) {
  const backend: TatolabBackend = { ...createMockTatolabBackend(readMockTatolabOptions(new URLSearchParams(pageQuery))), ...backendChanges };
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  let showTatolabStatus: ((status: TatolabStatus) => void) | null = null;
  await backend.onTatolabStatusChanged((status) => showTatolabStatus?.(status));
  const firstStatus = await backend.getTatolabStatus();
  await act(async () => {
    showTatolabStatus = mountTatolabWindow(rootElement, backend, firstStatus.platform, { watchExposedOutput: false });
    showTatolabStatus(firstStatus);
  });
  const showStatusAsTheBackendWould = (status: TatolabStatus) => act(() => showTatolabStatus?.(status));
  return { backend, windowContent: within(rootElement), showStatusAsTheBackendWould };
}

function rowOf(streamName: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-stream-row="${streamName}"]`);
  if (row === null) return expect.unreachable(`no row for ${streamName}`);
  return row;
}

describe("the Streams list", () => {
  it("words each stream's state, run mode and steps as the runtime lists it", async () => {
    await mountedWindowOverTheMock("state=running");

    const mainRow = within(rowOf("main"));
    expect(mainRow.getByText("Running")).toBeTruthy();
    expect(mainRow.getByText("Always on")).toBeTruthy();
    expect(mainRow.getByText("4")).toBeTruthy();
    expect(within(rowOf("attached-demo")).getByText("Dev session")).toBeTruthy();
    expect(within(rowOf("pattern-two")).getByText("Stopped")).toBeTruthy();
    expect(within(rowOf("pattern-two")).getByText("—")).toBeTruthy();
    expect(within(rowOf("lobby-recorder")).getByText("Failed")).toBeTruthy();
    expect(screen.getByText("3 of 5 loaded on jonathanf-macbook")).toBeTruthy();
  });

  it("stops a stream through the backend, shows it pending, then shows the runtime's new listing", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    expect(within(rowOf("camera")).getByRole("status").textContent).toBe("Stopping…");
    await waitFor(() => expect(within(rowOf("camera")).getByText("Stopped")).toBeTruthy());
    expect(within(rowOf("camera")).queryByRole("status")).toBeNull();
    expect(within(rowOf("camera")).getByRole("button", { name: "Start: loads it again from its record" })).toBeTruthy();
  });

  it("shows a refusal under its row in the runtime's own words", async () => {
    const refusal = "Runtime error: the kept stream `camera` is already stopped; `start` loads it again";
    await mountedWindowOverTheMock("state=running", {
      runStreamAction: async (_streamAction: TatolabStreamActionName) => {
        throw refusal;
      },
    });

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    await waitFor(() => expect(within(rowOf("camera")).getByRole("alert").textContent).toBe(`Stop was refused: ${refusal}`));
  });

  it("retries a failed stream, and a retry the runtime refuses keeps it failed with the retry's reason", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("lobby-recorder")).getByRole("button", { name: "Retry: loads it again from its record" }));

    await waitFor(() => expect(within(rowOf("lobby-recorder")).getByRole("alert").textContent).toMatch(/^Retry was refused: /));
    expect(within(rowOf("lobby-recorder")).getByText(/^`start` retried it, and it did not load: /)).toBeTruthy();
  });

  it("says in the runtime's words when it stopped a stream but could not record it stopped", async () => {
    await mountedWindowOverTheMock("state=running&stop_not_recorded=camera");

    fireEvent.click(within(rowOf("camera")).getByRole("button", { name: "Stop: unloads it and remembers it stopped" }));

    await waitFor(() =>
      expect(within(rowOf("camera")).getByRole("status").textContent).toBe(
        "Stopped, but not recorded, so it loads again when the runtime restarts: Runtime error: the kept record of `camera` could not be written: Permission denied (os error 13)",
      ),
    );
    expect(within(rowOf("camera")).getByText("Stopped")).toBeTruthy();
    expect(within(rowOf("camera")).queryByText("Starting")).toBeNull();
  });

  it("asks before removing a stream, and removes it only when told to", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(within(rowOf("pattern-two")).getByRole("button", { name: "More for pattern-two" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Remove/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove pattern-two?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(document.querySelector('[data-stream-row="pattern-two"]')).toBeNull());
  });

  it("guides a person with no streams to their first one", async () => {
    await mountedWindowOverTheMock("state=empty");

    expect(screen.getByText("No streams on jonathanf-macbook yet")).toBeTruthy();
    expect(screen.getByText("tatolab dev")).toBeTruthy();
  });

  it("shows the page that says why while the runtime is not running", async () => {
    await mountedWindowOverTheMock("state=stopped");

    expect(document.querySelector("[data-streams-list-page]")).toBeNull();
    expect(document.querySelector("[data-hosted-dom-page] .streams-page")).not.toBeNull();
    expect(screen.getByText("Runtime stopped")).toBeTruthy();
  });
});

describe("the window's shell", () => {
  it("opens a stream's page from its row and hosts the stream's view there", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(rowOf("main"));

    await waitFor(() => expect(document.querySelector("[data-hosted-dom-page] .streams-page .content-band-name")?.textContent).toBe("main"));
  });

  it("shows a stream the runtime lists while the first-stream guide is open", async () => {
    const { backend, showStatusAsTheBackendWould } = await mountedWindowOverTheMock("state=running");
    fireEvent.click(screen.getAllByRole("button", { name: "Add stream" })[0]);
    await waitFor(() => expect(document.querySelector("[data-hosted-dom-page] .first-stream-guide")).not.toBeNull());
    const statusBefore = await backend.getTatolabStatus();

    showStatusAsTheBackendWould({
      ...statusBefore,
      streams: [
        ...(statusBefore.streams ?? []),
        { name: "my-stream", state: "kept", project_directory: "/Users/ada/my-stream", node_count: 4, failed_because: null },
      ],
    });

    await waitFor(() => expect(document.querySelector("[data-hosted-dom-page] .streams-page .content-band-name")?.textContent).toBe("my-stream"));
  });

  it("keeps the person's theme choice", async () => {
    await mountedWindowOverTheMock("state=running");

    fireEvent.click(screen.getByRole("button", { name: "Use the dark theme" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("tatolab-window-theme")).toBe("dark");
  });

  it("names the runtime's state and the app's version in the status bar", async () => {
    await mountedWindowOverTheMock("state=running");

    expect(screen.getByText("Runtime running")).toBeTruthy();
    expect(screen.getByText("Tatolab 0.45.0")).toBeTruthy();
  });
});
