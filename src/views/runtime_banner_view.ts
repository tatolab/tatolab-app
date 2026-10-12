import { describeBackendRejection, type TatolabBackend } from "../backend/tatolab_backend";
import { createElement, createSvgFromMarkup } from "../dom";
import { ERROR_ICON_SVG, POWER_ICON_SVG, WARNING_ICON_SVG } from "../icons";
import type { RuntimeBannerPresentation, StatusTone } from "../presentation/runtime_presentation";

const BANNER_ACTION_LABELS: Record<NonNullable<RuntimeBannerPresentation["action"]>, string> = {
  turn_on_run_tatolab: "Turn on Run Tatolab",
  open_login_items: "Open Login Items",
  retry_run_tatolab: "Try again",
};

function runBannerAction(backend: TatolabBackend, action: NonNullable<RuntimeBannerPresentation["action"]>): Promise<void> {
  switch (action) {
    case "turn_on_run_tatolab":
    case "retry_run_tatolab":
      return backend.setRunTatolab(true);
    case "open_login_items":
      return backend.openLoginItemsSettings();
  }
}

function createBannerIcon(tone: StatusTone): Element {
  switch (tone) {
    case "progress":
      return createElement("span", { class: "progress-spinner" });
    case "warning":
      return createSvgFromMarkup(WARNING_ICON_SVG);
    case "error":
      return createSvgFromMarkup(ERROR_ICON_SVG);
    default:
      return createSvgFromMarkup(POWER_ICON_SVG);
  }
}

/** A strip across the Streams page saying why the runtime isn't running, with the one action that helps. */
export function createRuntimeBanner(
  backend: TatolabBackend,
  banner: RuntimeBannerPresentation,
  tone: StatusTone,
): HTMLElement {
  const actionFailure = createElement("p", { class: "runtime-banner-action-failure", role: "alert", hidden: true });
  const action = banner.action;
  const actionButton =
    action !== null &&
    createElement("button", { type: "button", class: tone === "idle" ? "button button-primary" : "button" }, [
      BANNER_ACTION_LABELS[action],
    ]);
  if (actionButton && action !== null) {
    actionButton.addEventListener("click", () => {
      actionButton.disabled = true;
      actionFailure.hidden = true;
      void runBannerAction(backend, action)
        .catch((rejection: unknown) => {
          actionFailure.textContent = describeBackendRejection(rejection);
          actionFailure.hidden = false;
        })
        .finally(() => {
          actionButton.disabled = false;
        });
    });
  }
  return createElement("div", { class: "runtime-banner", "data-tone": tone, role: "status" }, [
    createElement("span", { class: "runtime-banner-icon" }, [createBannerIcon(tone)]),
    createElement("div", { class: "runtime-banner-copy" }, [
      createElement("strong", { class: "runtime-banner-title" }, [banner.title]),
      createElement("span", { class: "runtime-banner-explanation" }, [banner.explanation]),
      actionFailure,
    ]),
    actionButton,
  ]);
}
