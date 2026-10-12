import type { TatolabPlatform } from "../backend/tatolab_backend_contract";
import { createElement } from "../dom";
import { CLOSE_ICON_SVG, EYE_ICON_SVG } from "../icons";
import { presentPlatform } from "../presentation/platform_presentation";
import { exposedOutputAddress } from "../presentation/stream_overview_presentation";
import { createCommandWell, createCopyButton } from "./copy_button";
import { createExposedAddressLabel, createIcon, createShortcutCap } from "./window_controls";

/** The output Watch is open on: its stream, node, port and exposure level. */
export interface WatchedOutput {
  streamName: string;
  machineName: string | null;
  node: string;
  port: string;
  /** `private`, `public`, `internal`, a newer level, or `null` for a port the stream doesn't expose. */
  exposureLevel: string | null;
}

/** Whether other streams and tools may read an output at `exposureLevel`, so Watch would show its frames. */
export function isWatchableExposureLevel(exposureLevel: string | null): boolean {
  return exposureLevel !== null && exposureLevel !== "internal";
}

/**
 * Watch, as a placeholder behind the `watch-exposed-output` flag: where an exposed output's frames will show once
 * the sharing step gives it data. It reads nothing from the stream: no timer, no poll, no backend call.
 */
export class WatchPlaceholderView {
  readonly element: HTMLElement;
  private readonly headerTitle: HTMLElement;
  private readonly body: HTMLElement;

  constructor(
    private readonly platform: TatolabPlatform,
    onClose: () => void,
  ) {
    this.headerTitle = createElement("div", { class: "watch-header-title" });
    this.body = createElement("div", { class: "watch-body" });
    this.element = createElement("section", { class: "watch-placeholder", "data-watch": "surface", "aria-label": "Watch" }, [
      createElement("header", { class: "watch-header" }, [
        createIcon(EYE_ICON_SVG, 16, "watch-header-eye"),
        this.headerTitle,
        createElement("span", { class: "log-dock-spacer" }),
        createElement("button", { type: "button", class: "button button-plain button-small", onClick: onClose }, [
          "Back to logs",
          createShortcutCap("esc"),
        ]),
        createElement("button", { type: "button", class: "icon-button", "aria-label": "Close Watch", title: "Close Watch", onClick: onClose }, [
          createIcon(CLOSE_ICON_SVG, 16),
        ]),
      ]),
      this.body,
    ]);
  }

  show(watchedOutput: WatchedOutput): void {
    const isReadable = isWatchableExposureLevel(watchedOutput.exposureLevel);
    this.headerTitle.replaceChildren(
      createElement("code", { class: "watch-header-node" }, [watchedOutput.node]),
      createElement("span", { class: "watch-header-separator", "aria-hidden": "true" }, ["›"]),
      createElement("code", { class: "watch-header-port" }, [watchedOutput.port]),
      createElement("span", { class: "watch-header-level" }, [isReadable ? capitalise(watchedOutput.exposureLevel ?? "") : "Internal"]),
    );
    this.body.dataset.readable = String(isReadable);
    this.body.replaceChildren(...(isReadable ? this.readableBody(watchedOutput) : this.internalBody(watchedOutput)));
  }

  private readableBody(watchedOutput: WatchedOutput): HTMLElement[] {
    const thisMachine = presentPlatform(this.platform).thisMachineMidSentence;
    const address = exposedOutputAddress(watchedOutput.machineName, watchedOutput.streamName, watchedOutput);
    const explanation = [
      "When it lands, this panel shows what ",
      createElement("code", {}, [watchedOutput.port]),
      ` carries: its latest picture and its newest samples, read the way any tool on ${thisMachine} reads a ${watchedOutput.exposureLevel} output. Nothing is read from the stream today.`,
    ];
    if (watchedOutput.exposureLevel === "public") explanation.push(" Public outputs also play from other machines, over the relay.");
    return [
      createElement("div", { class: "watch-frame", "aria-label": "No picture yet" }, [
        createIcon(EYE_ICON_SVG, 20),
        createElement("span", {}, ["No picture yet"]),
      ]),
      createElement("div", { class: "watch-details" }, [
        createElement("h3", { class: "watch-details-title" }, ["Watching arrives with the sharing step"]),
        createElement("p", { class: "watch-details-text" }, explanation),
        createElement("div", { class: "watch-details-address" }, [
          createExposedAddressLabel(address, "watch-details-address-label"),
          createCopyButton("the address", () => address.fullAddress),
        ]),
        createElement("p", { class: "watch-details-footnote" }, ["Shown because the watch-exposed-output flag is on."]),
      ]),
    ];
  }

  private internalBody(watchedOutput: WatchedOutput): HTMLElement[] {
    const thisMachine = presentPlatform(this.platform).thisMachineMidSentence;
    const exposeCommand = `tatolab expose ${watchedOutput.streamName} ${watchedOutput.node} ${watchedOutput.port}`;
    return [
      createElement("div", { class: "watch-internal" }, [
        createElement("h3", { class: "watch-details-title" }, [
          createElement("code", {}, [`${watchedOutput.node} › ${watchedOutput.port}`]),
          " is internal",
        ]),
        createElement("p", { class: "watch-details-text" }, [
          `Only ${watchedOutput.streamName}'s own nodes read it, so nothing outside the stream can watch it, this window included.`,
        ]),
        createElement("p", { class: "watch-details-text" }, [`Make it private to read it on ${thisMachine}:`]),
        createCommandWell([{ command: exposeCommand, description: null }]),
        createElement("p", { class: "watch-details-footnote" }, [
          `The change is live; ${watchedOutput.streamName} keeps running. `,
          createElement("code", {}, ["--remove"]),
          " makes it internal again.",
        ]),
      ]),
    ];
  }
}

function capitalise(word: string): string {
  return word === "" ? word : word[0].toUpperCase() + word.slice(1);
}
