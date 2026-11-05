import { describe, expect, it } from "vitest";
import type { ListedStream, RecentProject } from "../../shared/tatolab_backend_contract";
import type { ListedStreamsReading } from "../view_host/studio_view_contract";
import { presentHomeWithNoCards, presentRecentProjectCards, presentTimeSince } from "./home_presentation";

const NOW_MS = 1_790_000_000_000;
const HOUR_MS = 3_600_000;

const RECENT_PROJECTS: RecentProject[] = [
  { folder: "/Users/ada/streams/pattern", project_name: "pattern", last_opened_at_wall_clock_ms: NOW_MS - 2 * HOUR_MS },
  { folder: "/home/ada/streams/lobby", project_name: "lobby-recorder", last_opened_at_wall_clock_ms: NOW_MS - 30 * HOUR_MS },
  { folder: "/Users/ada/Desktop/old-sketch/", project_name: null, last_opened_at_wall_clock_ms: NOW_MS - 40 * 24 * HOUR_MS },
];

function listedWithAStreamOf(projectDirectory: string, state: string): ListedStreamsReading {
  const listing: ListedStream = {
    stream: "pattern-main-0a1b2c",
    display_name: "main",
    location: { project_directory: projectDirectory, stream_function: "stream:main" },
    state,
    node_count: null,
    failed_because: null,
    capture_devices_whose_access_was_never_asked_for: [],
    action: null,
    step: null,
  };
  return { kind: "listed", streams: [listing] };
}

describe("when a project was last opened", () => {
  it("reads in words, from just now to years", () => {
    expect(presentTimeSince(NOW_MS - 20_000, NOW_MS)).toBe("just now");
    expect(presentTimeSince(NOW_MS - 5 * 60_000, NOW_MS)).toBe("5 minutes ago");
    expect(presentTimeSince(NOW_MS - 2 * HOUR_MS, NOW_MS)).toBe("2 hours ago");
    expect(presentTimeSince(NOW_MS - 30 * HOUR_MS, NOW_MS)).toBe("yesterday");
    expect(presentTimeSince(NOW_MS - 8 * 24 * HOUR_MS, NOW_MS)).toBe("last week");
    expect(presentTimeSince(NOW_MS - 800 * 24 * HOUR_MS, NOW_MS)).toBe("2 years ago");
    expect(presentTimeSince(NOW_MS + HOUR_MS, NOW_MS)).toBe("just now");
  });
});

describe("Home's project cards", () => {
  it("name each project, its folder under home and when it was opened, and mark one that doesn't read", () => {
    const cards = presentRecentProjectCards(RECENT_PROJECTS, { kind: "not_listed", because: "Tatolab is off" }, NOW_MS, "all_projects", "");
    expect(cards.map(({ name, folderWords, lastOpenedWords, isRunning, isUnreadable }) => [name, folderWords, lastOpenedWords, isRunning, isUnreadable])).toEqual([
      ["pattern", "~/streams/pattern", "2 hours ago", false, false],
      ["lobby-recorder", "~/streams/lobby", "yesterday", false, false],
      ["old-sketch", "~/Desktop/old-sketch/", "last month", false, true],
    ]);
  });

  it("mark a project running while a stream of it runs or prepares, and Running now lists only those", () => {
    const running = listedWithAStreamOf("/Users/ada/streams/pattern", "preparing");
    expect(presentRecentProjectCards(RECENT_PROJECTS, running, NOW_MS, "running_now", "").map((card) => [card.name, card.isRunning])).toEqual([["pattern", true]]);
    expect(presentRecentProjectCards(RECENT_PROJECTS, listedWithAStreamOf("/Users/ada/streams/pattern", "stopped"), NOW_MS, "running_now", "")).toEqual([]);
  });

  it("narrow to a search of the name or the folder, ignoring case", () => {
    const listedNone: ListedStreamsReading = { kind: "listed", streams: [] };
    expect(presentRecentProjectCards(RECENT_PROJECTS, listedNone, NOW_MS, "all_projects", " LOBBY ").map((card) => card.name)).toEqual(["lobby-recorder"]);
    expect(presentRecentProjectCards(RECENT_PROJECTS, listedNone, NOW_MS, "all_projects", "desktop").map((card) => card.name)).toEqual(["old-sketch"]);
  });
});

describe("Home with no card to show", () => {
  it("says why: nothing opened yet, nothing running, or nothing matching the search", () => {
    expect(presentHomeWithNoCards("all_projects", "").title).toBe("No projects yet");
    expect(presentHomeWithNoCards("running_now", "").title).toBe("Nothing is running");
    expect(presentHomeWithNoCards("running_now", "lobby")).toEqual({ title: "No project matches", explanation: "Nothing recent is named like “lobby”." });
  });
});
