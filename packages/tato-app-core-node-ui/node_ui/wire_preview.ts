// The control a Texture input's annotation names `preview`: the picture on the wire into it, the
// latest frame to arrive drawn on the node each time the display draws. A Texture holds no value, so
// the control fires nothing; with nothing wired in, or while the output wired in sends no picture, it
// says why.

import { LatestPortViewerPictureDrawnEachAnimationFrame, type ViewInputEvent } from "@tatolab/tato-app-view-sdk";
import type { ControlledPin, InputControlElement, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { WireReading } from "./wire_reading.ts";

/** The picture on the wire into a Texture input. */
export default class WirePreview extends HTMLElement implements InputControlElement<"texture"> {
  readonly #picture = document.createElement("canvas");
  readonly #words = document.createElement("span");
  readonly #reading = new WireReading((event) => this.#show(event));
  readonly #pictureDrawn = new LatestPortViewerPictureDrawnEachAnimationFrame(this.#picture, (picture, isDrawn) => {
    if (isDrawn) this.#showThePicture();
    else this.#showWords(`A picture in ${picture.format_wire_name} is not drawn here.`);
  });

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [controlStyles];
    const preview = document.createElement("div");
    preview.className = "wire-preview";
    this.#picture.className = "wire-picture";
    this.#picture.hidden = true;
    this.#words.className = "wire-words";
    this.#words.textContent = "Waiting for a picture";
    preview.append(this.#picture, this.#words);
    shadow.append(preview);
  }

  set pin({ declaration, studio }: ControlledPin<"texture">) {
    this.#picture.setAttribute("aria-label", `The picture on the wire into ${declaration.label}`);
    this.#reading.readFrom(studio, declaration.input_name);
  }

  /** A Texture holds no value, so there is none to show. */
  set value(_value: null) {}

  /** A preview is never edited, so it looks the same in every state. */
  set state(_state: InputControlState) {}

  connectedCallback(): void {
    this.#reading.start();
  }

  disconnectedCallback(): void {
    this.#reading.stop();
    this.#pictureDrawn.dropTheWaitingPicture();
  }

  #show(event: ViewInputEvent): void {
    switch (event.kind) {
      case "image_frame":
      case "image_pixels":
        this.#pictureDrawn.drawOnTheNextAnimationFrame(event);
        return;
      case "message":
        this.#showWords(`What is wired in carries ${event.reading.family}, not pictures.`);
        return;
      case "reopening":
      case "ended":
      case "unwired":
        this.#showWords(event.because);
        return;
    }
  }

  #showThePicture(): void {
    this.#picture.hidden = false;
    this.#words.hidden = true;
  }

  #showWords(words: string): void {
    this.#pictureDrawn.dropTheWaitingPicture();
    this.#picture.hidden = true;
    this.#words.hidden = false;
    this.#words.textContent = words;
    this.#words.title = words;
  }
}
