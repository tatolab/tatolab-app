// The `file_picker` control of an Asset input: one button that names the asset held by its file
// name, with no preview, and opens the Studio's asset picker when pressed. An asset chosen other than
// the one held is one `change` carrying `{"asset": "<uuid>"}`; the picker offers the project's own
// assets, of the media the type narrows it to. An asset of an import keeps its `from` as stored, and
// one the project does not list is named by its UUID. Where the picker cannot start, its reason
// shows under the button.

import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState, type NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { AssetPinValue, ProjectAssetMedia } from "@tatolab/tato-app-view-sdk/pin_types";
import type { ProjectAsset } from "@tatolab/tato-app-view-sdk/studio_readings";

/** A button that picks a file of the project for an Asset input. */
export default class AssetFilePicker extends HTMLElement implements InputControlElement<"asset"> {
  readonly #button = document.createElement("button");
  readonly #words = document.createElement("span");
  readonly #refusal = document.createElement("span");
  #studio: NodeUiElementHost | null = null;
  #stopWatchingTheAssets: (() => void) | null = null;
  #label = "";
  #media: ProjectAssetMedia[] | null = null;
  #chosen: AssetPinValue | null = null;
  #assets: readonly ProjectAsset[] = [];
  #editable = false;
  #isThePickerOpen = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    this.#button.type = "button";
    this.#button.className = "file-picker";
    this.#words.className = "file-picker-words";
    this.#button.append(this.#words);
    this.#refusal.className = "file-picker-refusal";
    this.#refusal.hidden = true;
    shadow.append(this.#button, this.#refusal);
    this.#button.addEventListener("click", () => this.#chooseAFile());
    this.#show();
  }

  set pin({ declaration, studio }: ControlledPin<"asset">) {
    this.#studio = studio;
    this.#label = declaration.label;
    const media = declaration.pin_type.media ?? [];
    this.#media = media.length === 0 ? null : [...media];
    this.#show();
  }

  set value(asset: AssetPinValue) {
    this.#chosen = asset;
    this.#show();
  }

  set state(state: InputControlState) {
    this.#editable = state === "editable";
    this.#show();
  }

  connectedCallback(): void {
    this.#stopWatchingTheAssets ??=
      this.#studio?.watchProjectAssets((reading) => {
        this.#assets = reading.kind === "listed" ? reading.listing.assets : [];
        this.#show();
      }) ?? null;
  }

  disconnectedCallback(): void {
    this.#stopWatchingTheAssets?.();
    this.#stopWatchingTheAssets = null;
  }

  /** The asset of the project the value names, `null` for an asset of an import or one the project does not list. */
  #chosenAsset(): ProjectAsset | null {
    const chosen = this.#chosen;
    if (chosen === null || chosen.from !== undefined) return null;
    return this.#assets.find((asset) => asset.asset === chosen.asset) ?? null;
  }

  #chooseAFile(): void {
    const studio = this.#studio;
    if (!this.#editable || this.#isThePickerOpen || studio === null) return;
    this.#isThePickerOpen = true;
    this.#show();
    void studio.pickAProjectAsset({ media: this.#media, chosen_now: this.#chosenAsset()?.asset ?? null }).then((ending) => {
      this.#isThePickerOpen = false;
      this.#showTheRefusal(ending.kind === "not_started" ? ending.because : null);
      if (ending.kind === "chosen" && this.#editable && (this.#chosen?.asset !== ending.asset || this.#chosen.from !== undefined)) {
        this.#chosen = { asset: ending.asset };
        fireInputControlEvent(this, "change", this.#chosen);
      }
      this.#show();
    });
  }

  #showTheRefusal(because: string | null): void {
    this.#refusal.textContent = because ?? "";
    this.#refusal.hidden = because === null;
  }

  /** The value in words: the file name of the asset it names, its UUID where the project lists no such asset, and None for none. */
  #wordsOfTheValue(): string {
    const chosen = this.#chosen;
    if (chosen === null) return "None";
    const path = this.#chosenAsset()?.path ?? null;
    return path === null ? chosen.asset : (path.split("/").at(-1) ?? path);
  }

  #show(): void {
    const words = this.#wordsOfTheValue();
    this.#words.textContent = words;
    this.#button.title = words;
    this.#button.disabled = !this.#editable || this.#isThePickerOpen;
    this.#button.setAttribute("aria-label", this.#editable ? `Choose a file for ${this.#label}: ${words}` : `${this.#label}: ${words}`);
  }
}
