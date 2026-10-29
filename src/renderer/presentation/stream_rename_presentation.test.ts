import { describe, expect, it } from "vitest";
import type { ListedStream } from "../../shared/tatolab_backend_contract";
import { canRenameStreamTo, displayNameToRenameTo, presentStreamRenameDialog } from "./stream_rename_presentation";

const MAIN: ListedStream = {
  stream: "heat-map-main-8eda1f",
  display_name: "main",
  location: { project_directory: "/Users/ada/streams/heat-map", stream_function: "stream:main" },
  state: "running",
  node_count: 4,
  failed_because: null,
};

describe("the rename dialog", () => {
  it("names the stream by its display name, and says its id and address stay", () => {
    expect(presentStreamRenameDialog(MAIN)).toEqual({
      title: "Rename main",
      description: "Its address stays the same.",
    });
  });

  it("renames to the typed name without the spaces around it, and only to a name that shows something new", () => {
    expect(displayNameToRenameTo("  Heat map ")).toBe("Heat map");
    expect(canRenameStreamTo(MAIN, "Heat map")).toBe(true);
    expect(canRenameStreamTo(MAIN, " main ")).toBe(false);
    expect(canRenameStreamTo(MAIN, "   ")).toBe(false);
  });
});
