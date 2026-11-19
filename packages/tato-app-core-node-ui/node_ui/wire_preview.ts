// The control a Texture input's annotation names `preview`: the picture on the wire into it, drawn on
// the node as each frame arrives. A Texture holds no value, so the control fires nothing; with
// nothing wired in, or while the output wired in sends no picture, it says why.

import { drawThePortViewerFrame, drawThePortViewerPixels, type ViewInputEvent } from "@tatolab/tato-app-view-sdk";
import type { ControlledPin, InputControlElement, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { WireReading } from "./wire_reading.ts";

/** The picture on the wire into a Texture input. */
export default class WirePreview extends HTMLElement implements InputControlElement<"texture"> {
  readonly #picture = document.createElement("canvas");
  readonly #words = document.createElement("span");
  readonly #reading = new WireReading((event) => this.#show(event));

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
  }

  #show(event: ViewInputEvent): void {
    switch (event.kind) {
      case "image_frame":
        drawThePortViewerFrame(this.#picture, event.video_frame);
        event.video_frame.close();
        this.#showThePicture();
        return;
      case "image_pixels":
        if (drawThePortViewerPixels(this.#picture, event.width, event.height, event.format_wire_name, event.bytes_per_row, event.pixels)) this.#showThePicture();
        else this.#showWords(`A picture in ${event.format_wire_name} is not drawn here.`);
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
    this.#picture.hidden = true;
    this.#words.hidden = false;
    this.#words.textContent = words;
    this.#words.title = words;
  }
}
