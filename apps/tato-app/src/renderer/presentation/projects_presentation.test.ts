import { describe, expect, it } from "vitest";
import type { RecentProject } from "../../shared/tatolab_backend_contract";
import { presentProjectsWithNoCards, presentRecentProjectCards, presentTimeSince } from "./projects_presentation";

const NOW_MS = 1_790_000_000_000;
const HOUR_MS = 3_600_000;

const RECENT_PROJECTS: RecentProject[] = [
  { folder: "/Users/ada/streams/pattern", project_name: "pattern", last_opened_at_wall_clock_ms: NOW_MS - 2 * HOUR_MS },
  { folder: "/home/ada/streams/lobby", project_name: "lobby-recorder", last_opened_at_wall_clock_ms: NOW_MS - 30 * HOUR_MS },
  { folder: "/Users/ada/Desktop/old-sketch/", project_name: null, last_opened_at_wall_clock_ms: NOW_MS - 40 * 24 * HOUR_MS },
];

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

describe("the Projects window's cards", () => {
  it("name each project, its folder under home and when it was opened, and mark one that doesn't read", () => {
    const cards = presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "");
    expect(cards.map(({ name, folderWords, lastOpenedWords, isUnreadable }) => [name, folderWords, lastOpenedWords, isUnreadable])).toEqual([
      ["pattern", "~/streams/pattern", "2 hours ago", false],
      ["lobby-recorder", "~/streams/lobby", "yesterday", false],
      ["old-sketch", "~/Desktop/old-sketch/", "last month", true],
    ]);
  });

  it("narrow to a search of the name or the folder, ignoring case", () => {
    expect(presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, " LOBBY ").map((card) => card.name)).toEqual(["lobby-recorder"]);
    expect(presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "desktop").map((card) => card.name)).toEqual(["old-sketch"]);
  });
});

describe("the Projects window with no card to show", () => {
  it("says why: nothing opened yet, or nothing matching the search", () => {
    expect(presentProjectsWithNoCards("").title).toBe("No projects yet");
    expect(presentProjectsWithNoCards("lobby")).toEqual({ title: "No project matches", explanation: "Nothing recent is named like “lobby”." });
  });
});
