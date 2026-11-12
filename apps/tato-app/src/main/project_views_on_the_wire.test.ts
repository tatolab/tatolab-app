import { expect, test } from "vitest";
import { projectViewsFromTheListProjectViewsToolResult } from "./project_views_on_the_wire.js";

const DECK_THAT_DOES_NOT_OPEN = { view_type: "night-show:deck", project_name: "night-show", view_folder_in_the_project: "views/deck", opens: false };

test("a listed view that does not open carries the runtime's why, and one without it is not read", () => {
  expect(projectViewsFromTheListProjectViewsToolResult({ views: [{ ...DECK_THAT_DOES_NOT_OPEN, not_opened_because: "`entry`: index.html is not a file" }] })).toEqual({
    ok: true,
    value: [
      {
        view_type: "night-show:deck",
        project_name: "night-show",
        import_folder: null,
        view_folder_in_the_project: "views/deck",
        manifest: null,
        opens: false,
        not_opened_because: "`entry`: index.html is not a file",
      },
    ],
  });
  expect(projectViewsFromTheListProjectViewsToolResult({ views: [DECK_THAT_DOES_NOT_OPEN] })).toEqual({
    ok: false,
    failure: "the runtime's list_project_views result could not be read: night-show:deck does not open and `not_opened_because` says no why",
  });
});
