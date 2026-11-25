// The control an Audio input's annotation names `meter`: the level on the wire into it, as the peak
// of each block of samples that arrives, in decibels below full scale. An Audio input holds no value,
// so the control fires nothing; with nothing wired in, or while the output wired in sends no audio,
// it says why.

import { wordsOfTheMessageRead, type ViewInputEvent } from "@tatolab/tato-app-view-sdk";
import type { ControlledPin, InputControlElement, InputControlState } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import { WireReading } from "./wire_reading.ts";

/** The quietest level the meter shows; anything quieter reads as silence. */
const QUIETEST_LEVEL_DECIBELS = -60;

/** The peak of `channelSamples`, every channel's samples of one block, as decibels below full scale; `-Infinity` for silence. */
export function peakLevelInDecibels(channelSamples: readonly Float32Array[]): number {
  let peak = 0;
  for (const samples of channelSamples) for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return 20 * Math.log10(peak);
}

/** How far along the meter `decibels` reaches, from 0 at the quietest level it shows to 1 at full scale. */
function reachOfTheLevel(decibels: number): number {
  return Math.min(1, Math.max(0, (decibels - QUIETEST_LEVEL_DECIBELS) / -QUIETEST_LEVEL_DECIBELS));
}

/** The level on the wire into an Audio input. */
export default class WireMeter extends HTMLElement implements InputControlElement<"audio"> {
  readonly #meter = document.createElement("div");
  readonly #fill = document.createElement("div");
  readonly #words = document.createElement("span");
  readonly #reading = new WireReading((event) => this.#show(event));

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [controlStyles];
    const row = document.createElement("div");
    row.className = "wire-meter";
    this.#meter.className = "meter-track";
    this.#meter.setAttribute("role", "meter");
    this.#meter.setAttribute("aria-valuemin", String(QUIETEST_LEVEL_DECIBELS));
    this.#meter.setAttribute("aria-valuemax", "0");
    this.#fill.className = "meter-fill";
    this.#meter.append(this.#fill);
    this.#words.className = "wire-words";
    this.#words.textContent = "Waiting for audio";
    row.append(this.#meter, this.#words);
    shadow.append(row);
    this.#meter.hidden = true;
  }

  set pin({ declaration, studio }: ControlledPin<"audio">) {
    this.#meter.setAttribute("aria-label", `The level on the wire into ${declaration.label}`);
    this.#reading.readFrom(studio, declaration.input_name);
  }

  /** An Audio input holds no value, so there is none to show. */
  set value(_value: null) {}

  /** A meter is never edited, so it looks the same in every state. */
  set state(_state: InputControlState) {}

  connectedCallback(): void {
    this.#reading.start();
  }

  disconnectedCallback(): void {
    this.#reading.stop();
  }

  #show(event: ViewInputEvent): void {
    switch (event.kind) {
      case "message":
        if (event.reading.message === "channels_block") this.#showTheLevel(peakLevelInDecibels(event.reading.channel_samples));
        else this.#showWords(`What is wired in carries ${wordsOfTheMessageRead(event.reading)}, not audio.`);
        return;
      case "image_frame":
        event.video_frame.close();
        this.#showWords("What is wired in carries pictures, not audio.");
        return;
      case "image_pixels":
        this.#showWords("What is wired in carries pictures, not audio.");
        return;
      case "reopening":
      case "ended":
      case "unwired":
        this.#showWords(event.because);
        return;
    }
  }

  #showTheLevel(decibels: number): void {
    const isHeard = decibels >= QUIETEST_LEVEL_DECIBELS;
    this.#meter.hidden = false;
    this.#fill.style.width = `${(reachOfTheLevel(decibels) * 100).toFixed(1)}%`;
    this.#meter.setAttribute("aria-valuenow", String(isHeard ? Math.round(decibels) : QUIETEST_LEVEL_DECIBELS));
    this.#words.textContent = isHeard ? `${Math.round(decibels)} dB` : "Silent";
    this.#words.hidden = false;
  }

  #showWords(words: string): void {
    this.#meter.hidden = true;
    this.#words.hidden = false;
    this.#words.textContent = words;
    this.#words.title = words;
  }
}
