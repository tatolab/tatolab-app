import { createElement, createSvgFromMarkup } from "../dom";
import { POWER_ICON_SVG, TATOLAB_MARK_SVG, TERMINAL_ICON_SVG } from "../icons";
import { createStandaloneCommand } from "./copy_button";
import { createSetupStepList, inlineCode } from "./setup_step_list";
import { createSpinner } from "./window_controls";

const LINUX_INSTALL_COMMAND = "curl -fsSL https://get.tatolab.com/install.sh | sh";

/** The whole window while Linux has no tatolabd.service: the installer's one line, and the wait for the service. */
export class LinuxRuntimeInstallView {
  readonly element: HTMLElement;

  constructor() {
    this.element = createElement("main", { class: "setup-screen setup-screen-linux" }, [
      createElement("div", { class: "centred-page" }, [
        createElement("div", { class: "centred-page-column" }, [
          createElement("span", { class: "setup-screen-mark" }, [createSvgFromMarkup(TATOLAB_MARK_SVG)]),
          createElement("h1", { class: "screen-heading setup-screen-heading" }, ["Install the Tatolab runtime"]),
          createElement("p", { class: "screen-lede" }, [
            "This app shows and controls ",
            inlineCode("tatolabd.service"),
            ", the runtime the Tatolab installer sets up. It isn't on this computer yet. Run this in a terminal:",
          ]),
          createStandaloneCommand(LINUX_INSTALL_COMMAND),
          createSetupStepList([
            {
              iconSvg: TERMINAL_ICON_SVG,
              title: ["Installs ", inlineCode("tatolab"), " and ", inlineCode("tatolabd")],
              note: ["Into ", inlineCode("~/.local/bin"), "."],
            },
            {
              iconSvg: POWER_ICON_SVG,
              title: ["Starts ", inlineCode("tatolabd.service")],
              note: ["For your user, now and at login."],
            },
          ]),
          createElement("p", { class: "setup-screen-waiting", role: "status" }, [
            createSpinner(),
            createElement("span", {}, ["Waiting for ", inlineCode("tatolabd.service"), ". This window carries on by itself."]),
          ]),
        ]),
      ]),
    ]);
  }
}
