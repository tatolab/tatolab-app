import { describe, expect, it } from "vitest";
import type { RecentProject } from "../../shared/tatolab_backend_contract";
import {
  PROJECTS_HOME_CHOICES_AT_FIRST,
  presentNewProjectSheetWords,
  projectDescriptionToSave,
  projectNameToSave,
  presentProjectDeletionQuestion,
  presentRecentProjectChangePendingWords,
  presentRecentProjectChangeRefusalTitle,
  projectRenameRefusal,
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

/** A recent project as `read_recent_projects` answers it, edited `editedHoursAgo` before now or never, opened `openedHoursAgo` before. */
function aRecentProject(folder: string, projectName: string | null, openedHoursAgo: number, editedHoursAgo: number | null = null, projectDescription: string | null = null): RecentProject {
  return {
    folder,
    project_name: projectName,
    project_description: projectDescription,
    last_edited_at_wall_clock_ms: editedHoursAgo === null ? null : NOW_MS - editedHoursAgo * HOUR_MS,
    last_opened_at_wall_clock_ms: NOW_MS - openedHoursAgo * HOUR_MS,
    has_a_chosen_cover: false,
  };
}

const RECENT_PROJECTS: RecentProject[] = [
  aRecentProject("/Users/ada/streams/pattern", "pattern", 2, 50, "A test pattern through a halftone effect into a brightness meter."),
  aRecentProject("/home/ada/streams/lobby", "lobby-recorder", 30, 1, "  "),
  aRecentProject("/Users/ada/Desktop/old-sketch/", null, 40 * 24),
];

describe("when a project was last edited or opened", () => {
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
  it("name each project, say what it is and when it was edited, and mark one that doesn't read", () => {
    const cards = presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "");
    expect(cards.map(({ name, descriptionWords, hasADescription, whenWords, whenWordsInTheList, isUnreadable }) => [name, descriptionWords, hasADescription, whenWords, whenWordsInTheList, isUnreadable])).toEqual([
      ["lobby-recorder", "No description yet", false, "Edited 1 hour ago", "1 hour ago", false],
      ["pattern", "A test pattern through a halftone effect into a brightness meter.", true, "Edited 2 days ago", "2 days ago", false],
      ["old-sketch", "No description yet", false, "Opened last month", "Opened last month", true],
    ]);
  });

  it("keep each project's folder under home for its tooltip", () => {
    expect(presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "").map((card) => card.folderWords)).toEqual(["~/streams/lobby", "~/streams/pattern", "~/Desktop/old-sketch/"]);
  });

  it("name each ⋯ button for the project and its folder, so two projects of one name read apart", () => {
    const twoPatterns = [aRecentProject("/Users/ada/a/pattern", "pattern", 1), aRecentProject("/Users/ada/b/pattern", "pattern", 2)];
    expect(presentRecentProjectCards(twoPatterns, NOW_MS, "").map((card) => card.moreActionsLabel)).toEqual(["Actions for pattern, ~/a/pattern", "Actions for pattern, ~/b/pattern"]);
  });

  it("narrow to a search of the name, the folder or the description, ignoring case", () => {
    expect(presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, " LOBBY ").map((card) => card.name)).toEqual(["lobby-recorder"]);
    expect(presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "desktop").map((card) => card.name)).toEqual(["old-sketch"]);
    expect(presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "halftone").map((card) => card.name)).toEqual(["pattern"]);
    expect(presentRecentProjectCards(RECENT_PROJECTS, NOW_MS, "no description").map((card) => card.name)).toEqual([]);
  });
});

describe("the Projects window with no card to show", () => {
  it("says why: nothing opened yet, or nothing matching the search", () => {
    expect(presentProjectsWithNoCards("").title).toBe("No projects yet");
    expect(presentProjectsWithNoCards("lobby")).toEqual({ title: "No project matches", explanation: "No recent project's name, folder or description holds “lobby”." });
  });
});

describe("the Projects window's order", () => {
  it("puts the most recently edited first, a project with no edit by when it was opened, or orders by name ignoring case", () => {
    const shuffled: RecentProject[] = [RECENT_PROJECTS[2], RECENT_PROJECTS[0], RECENT_PROJECTS[1]].flatMap((recentProject) => (recentProject === undefined ? [] : [recentProject]));
    expect(presentRecentProjectCards(shuffled, NOW_MS, "", "last_edited").map((card) => card.name)).toEqual(["lobby-recorder", "pattern", "old-sketch"]);
    const openedRecentlyButNeverEdited = aRecentProject("/Users/ada/streams/fresh", "fresh", 10);
    expect(presentRecentProjectCards([...shuffled, openedRecentlyButNeverEdited], NOW_MS, "", "last_edited").map((card) => card.name)).toEqual(["lobby-recorder", "fresh", "pattern", "old-sketch"]);
    const withUpperCase: RecentProject[] = [...RECENT_PROJECTS, aRecentProject("/Users/ada/streams/Atrium", "Atrium", 0)];
    expect(presentRecentProjectCards(withUpperCase, NOW_MS, "", "name").map((card) => card.name)).toEqual(["Atrium", "lobby-recorder", "old-sketch", "pattern"]);
  });

  it("puts equal names in the order they were edited", () => {
    const twoPatterns = [aRecentProject("/a/pattern", "pattern", 1, 9), aRecentProject("/b/pattern", "Pattern", 1, 2)];
    expect(presentRecentProjectCards(twoPatterns, NOW_MS, "", "name").map((card) => card.folder)).toEqual(["/b/pattern", "/a/pattern"]);
  });
});

describe("a project's ⋯ menu", () => {
  it("asks before deleting, naming the project and that its folder goes to the Trash", () => {
    expect(presentProjectDeletionQuestion("pattern")).toEqual({
      title: "Delete “pattern”?",
      explanation: "Its streams stop, and Tato Studio moves its folder to the Trash, where you can put it back.",
      confirmWords: "Move to Trash",
    });
  });

  it("refuses only a blank new name, which the runtime would refuse too", () => {
    expect(projectRenameRefusal("  ")).toBe("Give the project a name.");
    expect(projectRenameRefusal("lights/left")).toBeNull();
    expect(projectRenameRefusal("Night Show")).toBeNull();
  });

  it("says what is being done to a project while its duplicate or deletion runs", () => {
    expect(presentRecentProjectChangePendingWords("duplicate")).toBe("Duplicating…");
    expect(presentRecentProjectChangePendingWords("delete")).toBe("Moving to Trash…");
  });

  it("titles the notice of a change that did not happen by the change asked for", () => {
    expect(presentRecentProjectChangeRefusalTitle("rename")).toBe("The project wasn't renamed");
    expect(presentRecentProjectChangeRefusalTitle("duplicate")).toBe("The project wasn't duplicated");
    expect(presentRecentProjectChangeRefusalTitle("delete")).toBe("The project wasn't deleted");
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
    expect(presentRecentProjectCards([aRecentProject("/Users/ada/streams/--", "--", 0)], NOW_MS, "")[0]?.coverInitial).toBe("");
  });
});

describe("the Projects window's kept order and layout", () => {
  it("reads what was kept, and the first choice for anything missing or unknown", () => {
    expect(projectsHomeChoicesFromKept({ order: "name", layout: "list" })).toEqual({ order: "name", layout: "list" });
    expect(projectsHomeChoicesFromKept({ order: "size", layout: "list" })).toEqual({ order: "last_edited", layout: "list" });
    expect(projectsHomeChoicesFromKept({ order: "last_opened", layout: "grid" })).toEqual(PROJECTS_HOME_CHOICES_AT_FIRST);
    expect(projectsHomeChoicesFromKept("grid")).toEqual(PROJECTS_HOME_CHOICES_AT_FIRST);
    expect(projectsHomeChoicesFromKept(undefined)).toEqual(PROJECTS_HOME_CHOICES_AT_FIRST);
  });
});

describe("the Projects window's sort and View buttons", () => {
  it("show the chosen order and are named for the order and layout chosen", () => {
    expect(presentProjectsHomeChoices({ order: "last_edited", layout: "grid" })).toEqual({ sortWords: "Last edited", sortButtonLabel: "Sort: Last edited", viewButtonLabel: "View: Grid" });
    expect(presentProjectsHomeChoices({ order: "name", layout: "list" })).toEqual({ sortWords: "Name", sortButtonLabel: "Sort: Name", viewButtonLabel: "View: List" });
  });
});

describe("the sheet that makes a project", () => {
  it("creates a new project by its name, or imports a .zip into a folder it names, the project keeping its saved name", () => {
    expect(presentNewProjectSheetWords(null)).toEqual({
      title: "New project",
      description: "Tato Studio makes a folder for the project, with a stream to start from.",
      nameLabel: "Name",
      actionWords: "Create",
      pendingWords: "Creating…",
      refusalLead: "The project wasn't created:",
    });
    expect(presentNewProjectSheetWords("/Users/ada/Downloads/halftone-webcam-main.zip")).toEqual({
      title: "Import project",
      description: "Tato Studio makes a project of its own from halftone-webcam-main.zip, in a new folder. It keeps the name it was saved with.",
      nameLabel: "Folder name",
      actionWords: "Import",
      pendingWords: "Importing…",
      refusalLead: "The project wasn't imported:",
    });
  });
});

describe("the Project details panel", () => {
  it("edits the description the runtime serves, empty for none, and reads a chosen cover apart from the plain one", () => {
    const [describedCard] = presentRecentProjectCards([{ ...aRecentProject("/Users/ada/streams/pattern", "pattern", 2, 1, "A test pattern."), has_a_chosen_cover: true }], NOW_MS, "");
    expect(describedCard).toMatchObject({ descriptionToEdit: "A test pattern.", hasAChosenCover: true });
    const [undescribedCard] = presentRecentProjectCards([aRecentProject("/Users/ada/streams/lobby", "lobby", 2)], NOW_MS, "");
    expect(undescribedCard).toMatchObject({ descriptionToEdit: "", descriptionWords: "No description yet", hasAChosenCover: false });
  });

  it("saves a description only when it differs from the project's and from the one just sent, past the spaces around it, and saves a blank one to clear it", () => {
    expect(projectDescriptionToSave("A test pattern.", "A test pattern.", null)).toBeNull();
    expect(projectDescriptionToSave("  A test pattern. ", "A test pattern.", null)).toBeNull();
    expect(projectDescriptionToSave("Bars into a meter.", "A test pattern.", null)).toBe("Bars into a meter.");
    expect(projectDescriptionToSave("Bars into a meter.", "A test pattern.", "Bars into a meter.")).toBeNull();
    expect(projectDescriptionToSave("   ", "A test pattern.", null)).toBe("   ");
    expect(projectDescriptionToSave("", "", null)).toBeNull();
  });

  it("saves a name only when it differs from the project's and from the one just sent", () => {
    expect(projectNameToSave("pattern", "pattern", null)).toBeNull();
    expect(projectNameToSave(" pattern ", "pattern", null)).toBeNull();
    expect(projectNameToSave("Night Show", "pattern", null)).toBe("Night Show");
    expect(projectNameToSave("Night Show ", "pattern", "Night Show")).toBeNull();
  });
});
