import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { codeStudioLayout, compositionStudioLayout, editStudioLayout, StudioLayoutKeptInStorage } from "./studio_layout";
import {
  STUDIO_VIEW_HISTORY_STEPS_KEPT,
  studioViewHistoryStartingAt,
  studioViewHistoryStepped,
  studioViewHistoryStepsOf,
  studioViewHistoryWithAStepTo,
  studioViewHistoryWithTheShownStepAs,
  type StudioViewHistory,
} from "./studio_view_history";
import { StudioWindowModel, type StudioViewTypeTitles } from "./studio_window_model";

const SHEET_CHECK_FOLDER = "/Users/someone/Documents/Tato Studio/Sheet Check";
const LOBBY_FOLDER = "/Users/someone/Documents/Tato Studio/Lobby";

function steppedOrFail<Shown>(history: StudioViewHistory<Shown>, direction: "back" | "forward"): StudioViewHistory<Shown> {
  return Option.getOrThrowWith(studioViewHistoryStepped(history, direction), () => new Error(`no step ${direction}`));
}

describe("a studio window's view history", () => {
  it("steps back and forward through the views shown, as a browser steps through pages", () => {
    const history = studioViewHistoryWithAStepTo(studioViewHistoryWithAStepTo(studioViewHistoryStartingAt("composition"), "code"), "edit");
    const once = steppedOrFail(history, "back");
    expect(once).toEqual({ behind: ["composition"], shown: "code", ahead: ["edit"] });
    expect(steppedOrFail(once, "back")).toEqual({ behind: [], shown: "composition", ahead: ["code", "edit"] });
    expect(steppedOrFail(once, "forward")).toEqual(history);
  });

  it("drops the steps ahead when a new view is shown after Back", () => {
    const backOnComposition = steppedOrFail(studioViewHistoryWithAStepTo(studioViewHistoryStartingAt("composition"), "code"), "back");
    expect(studioViewHistoryWithAStepTo(backOnComposition, "review")).toEqual({ behind: ["composition"], shown: "review", ahead: [] });
  });

  it("takes no step to views the same, field by field, as the ones shown", () => {
    const history = studioViewHistoryStartingAt({ layout: compositionStudioLayout(), expanded_area_id: null });
    expect(studioViewHistoryWithAStepTo(history, { layout: compositionStudioLayout(), expanded_area_id: null })).toBe(history);
  });

  it("has no step beyond either end", () => {
    const history = studioViewHistoryStartingAt("composition");
    expect(Option.isNone(studioViewHistoryStepped(history, "back"))).toBe(true);
    expect(Option.isNone(studioViewHistoryStepped(history, "forward"))).toBe(true);
    expect(studioViewHistoryStepsOf(history)).toEqual({ can_go_back: false, can_go_forward: false });
    expect(studioViewHistoryStepsOf(null)).toEqual({ can_go_back: false, can_go_forward: false });
  });

  it("keeps the newest steps behind, dropping the oldest first", () => {
    let history = studioViewHistoryStartingAt(0);
    for (let step = 1; step <= STUDIO_VIEW_HISTORY_STEPS_KEPT + 5; step += 1) history = studioViewHistoryWithAStepTo(history, step);
    expect(history.behind).toHaveLength(STUDIO_VIEW_HISTORY_STEPS_KEPT);
    expect(history.behind[0]).toBe(5);
  });

  it("takes the shown step as the window shows it now, its place kept", () => {
    const history = steppedOrFail(studioViewHistoryWithAStepTo(studioViewHistoryStartingAt("composition"), "code"), "back");
    expect(studioViewHistoryWithTheShownStepAs(history, "composition, resized")).toEqual({ behind: [], shown: "composition, resized", ahead: ["code"] });
  });
});

/** View types named as Studio names its own, none changing. */
const STUDIO_VIEW_TYPE_TITLES: StudioViewTypeTitles = {
  viewTitleOf: (viewTypeId) => ({ code: "Code", viewer: "Node visualizer" })[viewTypeId] ?? null,
  viewTypeIdOf: (viewTypeId) => viewTypeId,
  watchChanges: () => () => {},
};

function studioWindowModelOpenOn(folder: string): StudioWindowModel {
  const studioWindowModel = new StudioWindowModel(new StudioLayoutKeptInStorage(null));
  showTheProjectIn(studioWindowModel, folder);
  return studioWindowModel;
}

function showTheProjectIn(studioWindowModel: StudioWindowModel, folder: string): void {
  studioWindowModel.showOpenProject({
    kind: "read",
    open_project: { project: { name: folder.split("/").at(-1) ?? folder, folder, project: `project-of-${folder}` }, imports: [], imports_not_listed_because: null },
  });
}

const PAINT_BALL = { kind: "file" as const, file: `${SHEET_CHECK_FOLDER}/nodes/paint_ball.py`, line: 12 };
const SYNTH_SONG = { kind: "file" as const, file: `${SHEET_CHECK_FOLDER}/nodes/synth_song.py`, line: 3 };

describe("Back and Forward in a studio window", () => {
  it("go back from a node's code to the Composition layout it was opened from, and forward into the code again", () => {
    const studioWindowModel = studioWindowModelOpenOn(SHEET_CHECK_FOLDER);
    expect(studioWindowModel.viewHistorySteps.readLatest()).toEqual({ can_go_back: false, can_go_forward: false });
    studioWindowModel.openView("code", PAINT_BALL, STUDIO_VIEW_TYPE_TITLES);
    const paintBallOpening = studioWindowModel.viewsOpenedOn.readLatest().code;
    expect(studioWindowModel.viewHistorySteps.readLatest()).toEqual({ can_go_back: true, can_go_forward: false });

    expect(studioWindowModel.stepThroughTheViewHistory("back")).toBe(true);
    expect(studioWindowModel.studioLayout.readLatest()?.layout).toEqual(compositionStudioLayout());
    expect(studioWindowModel.viewsOpenedOn.readLatest().code).toBeUndefined();
    expect(studioWindowModel.viewHistorySteps.readLatest()).toEqual({ can_go_back: false, can_go_forward: true });

    expect(studioWindowModel.stepThroughTheViewHistory("forward")).toBe(true);
    expect(studioWindowModel.studioLayout.readLatest()?.layout).toEqual(codeStudioLayout());
    expect(studioWindowModel.viewsOpenedOn.readLatest().code).toEqual(paintBallOpening);
    expect(studioWindowModel.stepThroughTheViewHistory("forward")).toBe(false);
  });

  it("step between the nodes Code was opened on, as a new opening each time", () => {
    const studioWindowModel = studioWindowModelOpenOn(SHEET_CHECK_FOLDER);
    studioWindowModel.openView("code", PAINT_BALL, STUDIO_VIEW_TYPE_TITLES);
    const paintBallOpening = studioWindowModel.viewsOpenedOn.readLatest().code;
    studioWindowModel.openView("code", SYNTH_SONG, STUDIO_VIEW_TYPE_TITLES);
    studioWindowModel.stepThroughTheViewHistory("back");
    expect(studioWindowModel.studioLayout.readLatest()?.layout).toEqual(codeStudioLayout());
    expect(studioWindowModel.viewsOpenedOn.readLatest().code).toEqual(paintBallOpening);
  });

  it("step through the area grown to fill the window, an area closed and a layout chosen from the menu", () => {
    const studioWindowModel = studioWindowModelOpenOn(SHEET_CHECK_FOLDER);
    studioWindowModel.expandArea("stream-graph", true);
    studioWindowModel.expandArea("stream-graph", false);
    studioWindowModel.closeArea("outliner");
    studioWindowModel.applyTheShippedLayout("edit");
    const shownAfterEachBack = [1, 2, 3, 4].map(() => {
      studioWindowModel.stepThroughTheViewHistory("back");
      const layoutShown = JSON.stringify(studioWindowModel.studioLayout.readLatest()?.layout);
      return { shows_the_outliner: layoutShown.includes('"outliner"'), expanded_area_id: studioWindowModel.expandedAreaId.readLatest() };
    });
    expect(shownAfterEachBack).toEqual([
      { shows_the_outliner: false, expanded_area_id: null },
      { shows_the_outliner: true, expanded_area_id: null },
      { shows_the_outliner: true, expanded_area_id: "stream-graph" },
      { shows_the_outliner: true, expanded_area_id: null },
    ]);
    expect(studioWindowModel.studioLayout.readLatest()?.layout).toEqual(compositionStudioLayout());
  });

  it("leave a split's sizes and the presets saved out of the steps, the sizes kept as the window showed them", () => {
    const studioWindowModel = studioWindowModelOpenOn(SHEET_CHECK_FOLDER);
    studioWindowModel.keepSplitSizes("composition-columns", { outliner: 30, "composition-middle": 50, properties: 20 });
    expect(studioWindowModel.viewHistorySteps.readLatest().can_go_back).toBe(false);
    const resizedComposition = studioWindowModel.studioLayout.readLatest()?.layout;
    studioWindowModel.applyTheShippedLayout("edit");
    studioWindowModel.saveTheLayoutAsAPreset("Mine");
    studioWindowModel.stepThroughTheViewHistory("back");
    expect(studioWindowModel.studioLayout.readLatest()).toMatchObject({ layout: resizedComposition, presets_saved: [{ title: "Mine", layout: editStudioLayout() }] });
  });

  it("take no step for a change that shows the same views", () => {
    const studioWindowModel = studioWindowModelOpenOn(SHEET_CHECK_FOLDER);
    studioWindowModel.applyTheShippedLayout("composition");
    studioWindowModel.expandArea("stream-graph", false);
    expect(studioWindowModel.viewHistorySteps.readLatest().can_go_back).toBe(false);
  });

  it("start over when another project opens", () => {
    const studioWindowModel = studioWindowModelOpenOn(SHEET_CHECK_FOLDER);
    studioWindowModel.applyTheShippedLayout("code");
    showTheProjectIn(studioWindowModel, LOBBY_FOLDER);
    expect(studioWindowModel.viewHistorySteps.readLatest()).toEqual({ can_go_back: false, can_go_forward: false });
    expect(studioWindowModel.stepThroughTheViewHistory("back")).toBe(false);
  });

  it("do nothing in a popped-out view's window", () => {
    const studioWindowModel = studioWindowModelOpenOn(SHEET_CHECK_FOLDER);
    studioWindowModel.applyTheShippedLayout("code");
    studioWindowModel.showAsPoppedOutView({ view_type_id: "code", window_title: "Code", pinned_to: null });
    expect(studioWindowModel.stepThroughTheViewHistory("back")).toBe(false);
  });
});
