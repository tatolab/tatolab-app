import type { ControlledPin, InputControlElementClass, InputControlState, NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import type { AssetPinValue } from "@tatolab/tato-app-view-sdk/pin_types";
import type { ProjectAsset, ProjectAssetsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import AssetField from "../node_ui/asset_field.ts";
import { eventsFiredBy } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-asset_field-test", AssetField);

/** What a control asks the Studio's asset picker, and what the picker answers. */
type ProjectAssetPick = Parameters<NodeUiElementHost["pickAProjectAsset"]>[0];
type ProjectAssetPickEnding = Awaited<ReturnType<NodeUiElementHost["pickAProjectAsset"]>>;

const POSTER = "baaf9e5a-0aff-45f7-a7ea-b83db51e5a3b";
const LOGO = "0d6c3f8e-5b2a-4c71-9e14-7a3f2b8d6c90";
const POSTER_PICTURE = "data:image/png;base64,UE9TVEVS";

function projectAsset(asset: string, path: string): ProjectAsset {
  return {
    asset,
    kind: "media",
    path,
    content_sha256: `sha-of-${asset}`,
    content_byte_len: 1024,
    import_settings: {},
    preview: { pixel_width: 64, pixel_height: 36, media_type: "image/png" },
    media_its_bytes_hold: ["image"],
  };
}

const LISTED: ProjectAssetsReading = {
  kind: "listed",
  listing: { project_directory: "/projects/demo", project: "PROJECT-ID", project_name: "demo", assets: [projectAsset(POSTER, "media/poster.png"), projectAsset(LOGO, "media/logo.png")] },
};

/** A Studio whose project lists the poster and the logo, reads the poster's picture, and answers each pick with `ending`; what it was asked is kept. */
function studioOfTheDemoProject(ending: ProjectAssetPickEnding): { studio: NodeUiElementHost; picks: ProjectAssetPick[]; previewsRead: string[] } {
  const picks: ProjectAssetPick[] = [];
  const previewsRead: string[] = [];
  const studio: NodeUiElementHost = {
    pickAProjectAsset: (pick) => {
      picks.push(pick);
      return Promise.resolve(ending);
    },
    readAssetPreview: (asset) => {
      previewsRead.push(asset);
      return Promise.resolve(asset === POSTER ? { kind: "read", picture: { picture_url: POSTER_PICTURE, pixel_width: 64, pixel_height: 36 } } : { kind: "not_read", because: "no picture" });
    },
    watchProjectAssets: (listener) => {
      listener(LISTED);
      return () => undefined;
    },
    inputControlFor: () => Promise.reject(new Error("no control in this test")),
  };
  return { studio, picks, previewsRead };
}

function mountedAssetField(studio: NodeUiElementHost, value: AssetPinValue, { surface = "properties", state = "editable" }: { surface?: "node" | "properties"; state?: InputControlState } = {}): AssetField {
  const control = new AssetField();
  const pin: ControlledPin<"asset"> = { declaration: { input_name: "logo", label: "logo", pin_type: { type: "asset", media: ["image"] }, annotations: {}, may_be_unset: false }, surface, studio };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

/** The control's field once drawn, read when `isDrawn` holds of it. */
async function fieldOf(control: AssetField, isDrawn: (field: HTMLInputElement) => boolean = () => true): Promise<HTMLInputElement> {
  return vi.waitFor(() => {
    const field = control.querySelector<HTMLInputElement>("input[aria-label=logo]");
    if (field === null || !isDrawn(field)) throw new Error("the control draws no such field yet");
    return field;
  });
}

async function chooseButtonOf(control: AssetField): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const button = control.querySelector<HTMLButtonElement>("[data-property-asset-choose]");
    if (button === null) throw new Error("the control draws no choose button yet");
    return button;
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Asset field", () => {
  it("is the class the Studio defines for an Asset input", () => {
    expectTypeOf(AssetField).toExtend<InputControlElementClass<"asset">>();
  });

  it("names the asset held by its path in the project, with its preview picture read once", async () => {
    const { studio, previewsRead } = studioOfTheDemoProject({ kind: "ended", because: "closed" });
    const control = mountedAssetField(studio, { asset: POSTER });
    expect((await fieldOf(control, (field) => field.value === "media/poster.png")).value).toBe("media/poster.png");
    const picture = await vi.waitFor(() => {
      const image = control.querySelector<HTMLImageElement>("[data-property-asset-picture]");
      if (image === null) throw new Error("no picture yet");
      return image;
    });
    expect(picture.getAttribute("src")).toBe(POSTER_PICTURE);
    expect(previewsRead).toEqual([POSTER]);
  });

  it("names it by its file name alone on a node, with no picture, and by its UUID where the project lists no such asset", async () => {
    const { studio, previewsRead } = studioOfTheDemoProject({ kind: "ended", because: "closed" });
    const onANode = mountedAssetField(studio, { asset: POSTER }, { surface: "node" });
    expect((await fieldOf(onANode, (field) => field.value === "poster.png")).value).toBe("poster.png");
    expect(onANode.querySelector("[data-property-asset-picture]")).toBeNull();
    expect(previewsRead).toEqual([]);
    onANode.remove();
    const unlisted = mountedAssetField(studio, { asset: "11111111-2222-3333-4444-555555555555" });
    expect((await fieldOf(unlisted, (field) => field.value.startsWith("1111"))).value).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("asks the picker for the type's media with the asset held marked, and fires one change for another asset chosen", async () => {
    const { studio, picks } = studioOfTheDemoProject({ kind: "chosen", asset: LOGO });
    const control = mountedAssetField(studio, { asset: POSTER });
    const fired = eventsFiredBy(control);
    await fieldOf(control, (field) => field.value === "media/poster.png");
    (await chooseButtonOf(control)).click();
    await vi.waitFor(() => expect(fired).toEqual([{ name: "change", value: { asset: LOGO } }]));
    expect(picks).toEqual([{ media: ["image"], chosen_now: POSTER }]);
    expect((await fieldOf(control, (field) => field.value === "media/logo.png")).value).toBe("media/logo.png");
  });

  it("fires nothing for the asset held chosen again, and shows the Studio's words when the picker does not start", async () => {
    const again = studioOfTheDemoProject({ kind: "chosen", asset: POSTER });
    const held = mountedAssetField(again.studio, { asset: POSTER });
    const firedForTheHeld = eventsFiredBy(held);
    (await chooseButtonOf(held)).click();
    await vi.waitFor(() => expect(again.picks).toHaveLength(1));
    await Promise.resolve();
    expect(firedForTheHeld).toEqual([]);
    held.remove();

    const refused = studioOfTheDemoProject({ kind: "not_started", because: "The asset picker is open in another window." });
    const control = mountedAssetField(refused.studio, { asset: POSTER });
    const fired = eventsFiredBy(control);
    (await chooseButtonOf(control)).click();
    await vi.waitFor(() => expect(control.textContent).toContain("The asset picker is open in another window."));
    expect(fired).toEqual([]);
  });

  it("offers no choosing while the input is not editable", async () => {
    const { studio } = studioOfTheDemoProject({ kind: "chosen", asset: LOGO });
    const control = mountedAssetField(studio, { asset: POSTER }, { state: "read_only" });
    await fieldOf(control, (field) => field.value === "media/poster.png");
    expect(control.querySelector("[data-property-asset-choose]")).toBeNull();
  });
});
