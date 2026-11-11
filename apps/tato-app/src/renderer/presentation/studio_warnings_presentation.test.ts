import { expect, test } from "vitest";
import { presentStudioWarning, studioWarningsButtonWordsOf, studioWarningWhoseDialogIsDue } from "./studio_warnings_presentation";

test("the X11 warning names the session and how to leave it", () => {
  expect(presentStudioWarning("viewer_frames_copied_on_x11")).toEqual({
    title: "Running on X11",
    explanation:
      "Tato Studio is running on X11. Viewer performance may be reduced. Log in with the “Ubuntu” session (Wayland) from the gear on the login screen for full-speed viewers.",
  });
});

test("the warnings button counts what holds", () => {
  expect(studioWarningsButtonWordsOf([{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: false }])).toBe("1 warning");
  expect(
    studioWarningsButtonWordsOf([
      { kind: "viewer_frames_copied_on_x11", first_open_dialog_due: false },
      { kind: "viewer_frames_copied_on_x11", first_open_dialog_due: false },
    ]),
  ).toBe("2 warnings");
});

test("a warning's dialog is due only until it has been shown", () => {
  expect(studioWarningWhoseDialogIsDue([])).toBeNull();
  expect(studioWarningWhoseDialogIsDue([{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: false }])).toBeNull();
  expect(studioWarningWhoseDialogIsDue([{ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: true }])).toEqual({ kind: "viewer_frames_copied_on_x11", first_open_dialog_due: true });
});
