import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { createElement, type ElementChild } from "../dom";
import { LOCK_ICON_SVG, POWER_ICON_SVG } from "../icons";
import { RUNTIME_BANNER_ACTION_LABELS, RUNTIME_BANNER_ACTION_REFUSAL_LEADS, type RuntimeBannerPresentation, type RuntimeDisplayPresentation } from "../presentation/runtime_presentation";
import { runBannerAction } from "./action_through_the_backend";
import { createCopyButton } from "./copy_button";
import { createFailureIcon, createFailureLine, createIcon, createSpinner } from "./window_controls";

function headingIcon(presentation: RuntimeDisplayPresentation): Element | null {
  switch (presentation.displayState) {
    case "starting":
      return createSpinner();
    case "switched_off":
      return createIcon(POWER_ICON_SVG, 20, "runtime-page-heading-icon");
    case "needs_login_items_approval":
      return createIcon(LOCK_ICON_SVG, 20, "runtime-page-heading-icon");
    case "unreachable":
    case "never_answered":
    case "blocked_by_the_service_manager":
    case "runtime_missing_from_app":
    case "not_registered":
      return createFailureIcon(20);
    default:
      return null;
  }
}

function explanationOf(presentation: RuntimeDisplayPresentation, banner: RuntimeBannerPresentation): string {
  switch (presentation.displayState) {
    case "unreachable":
      return `${banner.explanation} Your kept streams come back with it.`;
    case "switched_off":
      return `${banner.explanation} The streams it keeps come back by themselves.`;
    default:
      return banner.explanation;
  }
}

function formatLocalClockTime(moment: Date): string {
  return [moment.getHours(), moment.getMinutes(), moment.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

function createPageColumn(children: ElementChild[]): HTMLElement {
  return createElement("div", { class: "centred-page runtime-page" }, [createElement("div", { class: "centred-page-column" }, children)]);
}

/**
 * The page that stands in for the streams while the runtime isn't running: what is going on, the one action that
 * helps, and for a runtime that stopped answering, what is known about it.
 */
export function createRuntimeStatePage(
  backend: TatolabBackend,
  presentation: RuntimeDisplayPresentation,
  lastAnsweredAt: Date | null,
): HTMLElement {
  const banner = presentation.banner;
  if (banner === null) return createPageColumn([]);
  const actionFailure = createFailureLine();
  const action = banner.action;
  const actionButton =
    action !== null &&
    createElement(
      "button",
      { type: "button", class: action === "retry_run_tatolab" ? "button" : "button button-primary", "data-runtime-banner-action": action },
      [RUNTIME_BANNER_ACTION_LABELS[action]],
    );
  if (actionButton && action !== null) {
    actionButton.addEventListener("click", () => {
      actionButton.disabled = true;
      actionFailure.show(null);
      void runBannerAction(backend, action)
        .catch((rejection: unknown) => actionFailure.show(`${RUNTIME_BANNER_ACTION_REFUSAL_LEADS[action]} ${describeBackendRejection(rejection)}`))
        .finally(() => {
          actionButton.disabled = false;
        });
    });
  }
  const isUnreachable = presentation.displayState === "unreachable";
  return createPageColumn([
    createElement("h1", { class: "runtime-page-heading", role: "status" }, [headingIcon(presentation), createElement("span", {}, [banner.title])]),
    createElement("p", { class: "runtime-page-explanation" }, [explanationOf(presentation, banner)]),
    actionButton &&
      createElement("div", { class: "runtime-page-actions" }, [
        actionButton,
        presentation.displayState === "switched_off" && createElement("span", { class: "runtime-page-action-note" }, ["Same as Run Tatolab in Settings."]),
      ]),
    actionButton && actionFailure.element,
    isUnreachable &&
      createElement("dl", { class: "runtime-page-facts" }, [
        lastAnsweredAt !== null && createElement("dt", {}, ["Last answered"]),
        lastAnsweredAt !== null && createElement("dd", {}, [createElement("code", {}, [formatLocalClockTime(lastAnsweredAt)])]),
        createElement("dt", {}, ["Run Tatolab"]),
        createElement("dd", {}, ["On"]),
        createElement("dt", {}, ["From a terminal"]),
        createElement("dd", { class: "runtime-page-fact-command" }, [
          createElement("code", { class: "selectable-text" }, ["tatolab streams"]),
          createCopyButton("tatolab streams", () => "tatolab streams"),
        ]),
      ]),
    isUnreachable &&
      createElement("p", { class: "runtime-page-waiting" }, [
        createSpinner(),
        "Still asking. This window carries on by itself when it answers.",
      ]),
  ]);
}

/** The page while the runtime runs but its stream list couldn't be read. */
export function createStreamsNotListedPage(): HTMLElement {
  return createPageColumn([
    createElement("h1", { class: "runtime-page-heading", role: "status" }, [createElement("span", {}, ["The runtime didn't list its streams"])]),
    createElement("p", { class: "runtime-page-explanation" }, [
      "It's running, but its stream list couldn't be read. Tatolab asks again every two seconds.",
    ]),
  ]);
}
