import { describe, expect, it } from "vitest";
import type { RecentProject } from "../../shared/tatolab_backend_contract";
import {
  PROJECTS_HOME_CHOICES_AT_FIRST,
  presentProjectsHomeChoices,
  presentProjectsWithNoCards,
  presentRecentProjectCards,
  presentTimeSince,
  projectCoverNumberOfTheName,
  projectsHomeChoicesFromKept,
} from "./projects_presentation";
import { PROJECT_COVER_NUMBERS } from "@tatolab/tato-app-view-sdk/design_system/project_card";

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
    expect(presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "")[0]?.detailWords).toBe("~/streams/pattern · Opened 2 hours ago");
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

describe("the Projects window's order", () => {
  it("puts the most recently opened first, or orders by name ignoring case", () => {
    const shuffled: RecentProject[] = [RECENT_PROJECTS[2], RECENT_PROJECTS[0], RECENT_PROJECTS[1]].flatMap((recentProject) => (recentProject === undefined ? [] : [recentProject]));
    expect(presentRecentProjectCards(shuffled, NOW_MS, "", "last_opened").map((card) => card.name)).toEqual(["pattern", "lobby-recorder", "old-sketch"]);
    const withUpperCase: RecentProject[] = [...RECENT_PROJECTS, { folder: "/Users/ada/streams/Atrium", project_name: "Atrium", last_opened_at_wall_clock_ms: NOW_MS }];
    expect(presentRecentProjectCards(withUpperCase, NOW_MS, "", "name").map((card) => card.name)).toEqual(["Atrium", "lobby-recorder", "old-sketch", "pattern"]);
  });
});

describe("a project's plain cover", () => {
  it("is picked from the name, the same each time, and carries the name's first letter or digit", () => {
    const [patternCard] = presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "pattern");
    expect(patternCard?.coverInitial).toBe("P");
    expect(patternCard?.coverNumber).toBe(projectCoverNumberOfTheName("pattern"));
    expect(projectCoverNumberOfTheName("pattern")).toBe(projectCoverNumberOfTheName(" Pattern "));
    const coversOfManyNames = new Set(["pattern", "camera", "lobby", "night show", "atrium", "halftone", "deck"].map(projectCoverNumberOfTheName));
    expect(coversOfManyNames.size).toBeGreaterThan(2);
    for (const coverNumber of coversOfManyNames) expect(PROJECT_COVER_NUMBERS).toContain(coverNumber);
    expect(presentRecentProjectCards([{ folder: "/Users/ada/streams/--", project_name: "--", last_opened_at_wall_clock_ms: NOW_MS }], NOW_MS, "")[0]?.coverInitial).toBe("");
  });
});

describe("the Projects window's kept order and layout", () => {
  it("reads what was kept, and the first choice for anything missing or unknown", () => {
    expect(projectsHomeChoicesFromKept({ order: "name", layout: "list" })).toEqual({ order: "name", layout: "list" });
    expect(projectsHomeChoicesFromKept({ order: "size", layout: "list" })).toEqual({ order: "last_opened", layout: "list" });
    expect(projectsHomeChoicesFromKept("grid")).toEqual(PROJECTS_HOME_CHOICES_AT_FIRST);
    expect(projectsHomeChoicesFromKept(undefined)).toEqual(PROJECTS_HOME_CHOICES_AT_FIRST);
  });
});

describe("the Projects window's sort and View buttons", () => {
  it("show the chosen order and are named for the order and layout chosen", () => {
    expect(presentProjectsHomeChoices({ order: "last_opened", layout: "grid" })).toEqual({ sortWords: "Last opened", sortButtonLabel: "Sort: Last opened", viewButtonLabel: "View: Grid" });
    expect(presentProjectsHomeChoices({ order: "name", layout: "list" })).toEqual({ sortWords: "Name", sortButtonLabel: "Sort: Name", viewButtonLabel: "View: List" });
  });
});
