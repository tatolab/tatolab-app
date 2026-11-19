// The default control of an Asset input: the design system's asset field, the asset it names by its
// path and its preview picture, with a button that opens the Studio's asset picker; on a node, whose
// row is narrow, by its file name alone. An asset chosen
// other than the one held is one `change` carrying `{"asset": "<uuid>"}`; the picker offers the
// project's own assets, of the media the type narrows it to. An asset of an import keeps its `from`
// as stored, and one the project does not list is named by its UUID.
// The field is the design system's React part, which the Studio supplies by name. It is drawn from a
// root in the control's own children, which its shadow root shows through a slot so the design
// system's stylesheet applies; the root and the watch of the project's assets are made as the control
// is connected and ended as it is taken off.

import { PropertyAssetField } from "@tatolab/tato-app-view-sdk/design_system/property_fields";
import { RefusalLine } from "@tatolab/tato-app-view-sdk/design_system/refusal_line";
import { fireInputControlEvent, type ControlledPin, type InputControlElement, type InputControlState, type NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import controlStyles from "@tatolab/tato-app-view-sdk/node_ui/input_control.css" with { type: "css" };
import type { AssetPinValue, ProjectAssetMedia } from "@tatolab/tato-app-view-sdk/pin_types";
import type { ProjectAsset, ProjectAssetsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";

/** The preview picture read for one asset's bytes, keyed so a changed asset is read again. */
interface PreviewRead {
  readonly key: string;
  readonly picture_url: string | null;
}

/** The key an asset's preview is read under: its UUID and the bytes it holds now. */
function previewKeyOf(asset: ProjectAsset): string {
  return `${asset.asset}:${asset.content_sha256}`;
}

/** The asset field of an Asset input. */
export default class AssetField extends HTMLElement implements InputControlElement<"asset"> {
  readonly #partElement = document.createElement("div");
  #partRoot: Root | null = null;
  #studio: NodeUiElementHost | null = null;
  #stopWatchingTheAssets: (() => void) | null = null;
  #fieldId = "";
  #label = "";
  #isOnANode = false;
  #media: ProjectAssetMedia[] | null = null;
  #chosen: AssetPinValue | null = null;
  #editable = false;
  #assets: readonly ProjectAsset[] = [];
  #preview: PreviewRead | null = null;
  #isThePickerOpen = false;
  #refusal: string | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open", delegatesFocus: true });
    shadow.adoptedStyleSheets = [controlStyles];
    const slot = document.createElement("slot");
    slot.className = "slot-of-the-part";
    shadow.append(slot);
  }

  set pin({ declaration, surface, studio }: ControlledPin<"asset">) {
    this.#studio = studio;
    this.#isOnANode = surface === "node";
    this.#fieldId = `asset-field-${declaration.input_name}-${crypto.randomUUID()}`;
    this.#label = declaration.label;
    const media = declaration.pin_type.media ?? [];
    this.#media = media.length === 0 ? null : [...media];
    this.#drawThePart();
  }

  set value(asset: AssetPinValue) {
    this.#chosen = asset;
    this.#readThePreview();
    this.#drawThePart();
  }

  set state(state: InputControlState) {
    this.#editable = state === "editable";
    this.#drawThePart();
  }

  connectedCallback(): void {
    if (this.#partElement.parentNode !== this) this.append(this.#partElement);
    this.#partRoot ??= createRoot(this.#partElement);
    this.#stopWatchingTheAssets ??= this.#studio?.watchProjectAssets((reading) => this.#assetsRead(reading)) ?? null;
    this.#drawThePart();
  }

  disconnectedCallback(): void {
    this.#stopWatchingTheAssets?.();
    this.#stopWatchingTheAssets = null;
    const partRoot = this.#partRoot;
    this.#partRoot = null;
    partRoot?.unmount();
  }

  #assetsRead(reading: ProjectAssetsReading): void {
    this.#assets = reading.kind === "listed" ? reading.listing.assets : [];
    this.#refusal = reading.kind === "listed" ? null : reading.because;
    this.#readThePreview();
    this.#drawThePart();
  }

  /** The asset of the project the value names, `null` for an asset of an import or one the project does not list. */
  #chosenAsset(): ProjectAsset | null {
    const chosen = this.#chosen;
    if (chosen === null || chosen.from !== undefined) return null;
    return this.#assets.find((asset) => asset.asset === chosen.asset) ?? null;
  }

  /** Reads the chosen asset's preview picture once for the bytes it holds now; an asset with none, and the field on a node, shows none. */
  #readThePreview(): void {
    const asset = this.#chosenAsset();
    const studio = this.#studio;
    if (asset === null || asset.preview === null || studio === null || this.#isOnANode) {
      this.#preview = null;
      return;
    }
    const key = previewKeyOf(asset);
    if (this.#preview?.key === key) return;
    this.#preview = { key, picture_url: null };
    void studio.readAssetPreview(asset.asset).then((reading) => {
      if (this.#preview?.key !== key) return;
      this.#preview = { key, picture_url: reading.kind === "read" ? reading.picture.picture_url : null };
      this.#drawThePart();
    });
  }

  #chooseAnAsset(): void {
    const studio = this.#studio;
    if (!this.#editable || this.#isThePickerOpen || studio === null) return;
    this.#isThePickerOpen = true;
    this.#drawThePart();
    void studio.pickAProjectAsset({ media: this.#media, chosen_now: this.#chosenAsset()?.asset ?? null }).then((ending) => {
      this.#isThePickerOpen = false;
      this.#refusal = ending.kind === "not_started" ? ending.because : null;
      if (ending.kind === "chosen" && this.#editable && (this.#chosen?.asset !== ending.asset || this.#chosen.from !== undefined)) {
        this.#chosen = { asset: ending.asset };
        this.#readThePreview();
        fireInputControlEvent(this, "change", this.#chosen);
      }
      this.#drawThePart();
    });
  }

  /** The value in words: the path of the asset it names, or on a node its file name, its UUID where the project lists no such asset, and None for none. */
  #words(): string {
    const chosen = this.#chosen;
    if (chosen === null) return "None";
    const path = this.#chosenAsset()?.path ?? null;
    if (path === null) return chosen.asset;
    return this.#isOnANode ? (path.split("/").at(-1) ?? path) : path;
  }

  #drawThePart(): void {
    this.#partRoot?.render(
      createElement(
        Fragment,
        null,
        createElement(PropertyAssetField, {
          fieldId: this.#fieldId,
          words: this.#words(),
          label: this.#label,
          previewPictureUrl: this.#preview?.picture_url ?? null,
          choosing: this.#editable
            ? { label: `Choose an asset for ${this.#label}…`, disabledReason: this.#isThePickerOpen ? "The asset picker is open." : null, onChooseAsked: () => this.#chooseAnAsset() }
            : undefined,
        }),
        this.#refusal === null ? null : createElement(RefusalLine, { words: this.#refusal, layout: "under_field" }),
      ),
    );
  }
}
