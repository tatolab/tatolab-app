import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MAIN_WINDOW_FIRST_STATUS_DRAW_WAIT_LIMIT_MS, MainWindowFirstShowGate } from "./main_window_first_show_gate.js";

let timesPutOnScreen = 0;
let firstShowGate: MainWindowFirstShowGate;

beforeEach(() => {
  vi.useFakeTimers();
  timesPutOnScreen = 0;
  firstShowGate = new MainWindowFirstShowGate(() => {
    timesPutOnScreen += 1;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

test("a show before the page has drawn its first status waits, through the first paint, until the page draws it", () => {
  firstShowGate.show();
  firstShowGate.pageFirstPainted();

  expect(timesPutOnScreen).toBe(0);
  expect(firstShowGate.showIsWaitingForThePage()).toBe(true);

  firstShowGate.pageDrewItsFirstStatus();

  expect(timesPutOnScreen).toBe(1);
  expect(firstShowGate.showIsWaitingForThePage()).toBe(false);
});

test("once the page has drawn its first status, a show puts the window on screen at once, and the wait limit adds no second show", () => {
  firstShowGate.pageFirstPainted();
  firstShowGate.pageDrewItsFirstStatus();
  firstShowGate.show();
  vi.advanceTimersByTime(MAIN_WINDOW_FIRST_STATUS_DRAW_WAIT_LIMIT_MS);

  expect(timesPutOnScreen).toBe(1);
});

test("a page that has painted but draws no first status within the wait limit shows as it is", () => {
  firstShowGate.show();
  firstShowGate.pageFirstPainted();

  vi.advanceTimersByTime(MAIN_WINDOW_FIRST_STATUS_DRAW_WAIT_LIMIT_MS - 1);
  expect(timesPutOnScreen).toBe(0);
  vi.advanceTimersByTime(1);

  expect(timesPutOnScreen).toBe(1);
  firstShowGate.pageDrewItsFirstStatus();
  expect(timesPutOnScreen).toBe(1);
});

test("a hidden window's page that has not painted yet, as under Wayland, still shows once the wait limit after the show has run", () => {
  firstShowGate.show();

  vi.advanceTimersByTime(MAIN_WINDOW_FIRST_STATUS_DRAW_WAIT_LIMIT_MS - 1);
  expect(timesPutOnScreen).toBe(0);
  vi.advanceTimersByTime(1);

  expect(timesPutOnScreen).toBe(1);
});

test("the wait limit never runs on a window nobody asked to show and whose page has not painted", () => {
  vi.advanceTimersByTime(MAIN_WINDOW_FIRST_STATUS_DRAW_WAIT_LIMIT_MS * 5);
  firstShowGate.pageDrewItsFirstStatus();

  expect(timesPutOnScreen).toBe(0);
});

test("a page that will draw nothing, as one that failed to load, shows at once", () => {
  firstShowGate.show();
  firstShowGate.pageWillDrawNothing();

  expect(timesPutOnScreen).toBe(1);
});

test("a hide drops the waiting show, so the page drawing its status later leaves the window hidden", () => {
  firstShowGate.show();
  firstShowGate.pageFirstPainted();
  firstShowGate.hide();

  expect(firstShowGate.showIsWaitingForThePage()).toBe(false);
  firstShowGate.pageDrewItsFirstStatus();

  expect(timesPutOnScreen).toBe(0);
});
