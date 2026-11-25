import type { ControlledPin, InputControlElementClass, InputControlState, NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import type { AssetPinValue } from "@tatolab/tato-app-view-sdk/pin_types";
import type { ProjectAssetsReading } from "@tatolab/tato-app-view-sdk/studio_readings";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import AssetFilePicker from "../node_ui/asset_file_picker.ts";
import { eventsFiredBy, partOf } from "./control_test_support.ts";

vi.mock("@tatolab/tato-app-view-sdk/node_ui/input_control.css", () => ({ default: new CSSStyleSheet() }));

customElements.define("tato-studio-asset_file_picker-test", AssetFilePicker);

type ProjectAssetPick = Parameters<NodeUiElementHost["pickAProjectAsset"]>[0];
type ProjectAssetPickEnding = Awaited<ReturnType<NodeUiElementHost["pickAProjectAsset"]>>;

const LUT = "6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8";
const GRADE = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const LISTED: ProjectAssetsReading = {
  kind: "listed",
  listing: {
    project_directory: "/projects/demo",
    project: "PROJECT-ID",
    project_name: "demo",
    assets: [
      { asset: LUT, kind: "media", path: "luts/warm.cube", content_sha256: "sha-lut", content_byte_len: 512, import_settings: {}, preview: null, media_its_bytes_hold: [] },
      { asset: GRADE, kind: "media", path: "luts/cold.cube", content_sha256: "sha-grade", content_byte_len: 512, import_settings: {}, preview: null, media_its_bytes_hold: [] },
    ],
  },
};

/** A Studio whose project lists two files and answers each pick with `ending`; what it was asked is kept. */
function studioOfTheDemoProject(ending: ProjectAssetPickEnding): { studio: NodeUiElementHost; picks: ProjectAssetPick[] } {
  const picks: ProjectAssetPick[] = [];
  const studio: NodeUiElementHost = {
    watchAudioCaptureDevices: () => () => undefined,
    pickAProjectAsset: (pick) => {
      picks.push(pick);
      return Promise.resolve(ending);
    },
    readAssetPreview: () => Promise.resolve({ kind: "not_read", because: "no preview in this test" }),
    watchProjectAssets: (listener) => {
      listener(LISTED);
      return () => undefined;
    },
    inputControlFor: () => Promise.reject(new Error("no control in this test")),
    watchWhatIsWiredInto: () => () => undefined,
  };
  return { studio, picks };
}

function mountedFilePicker(studio: NodeUiElementHost, value: AssetPinValue, state: InputControlState = "editable"): AssetFilePicker {
  const control = new AssetFilePicker();
  const pin: ControlledPin<"asset"> = { declaration: { input_name: "lut", label: "LUT", pin_type: { type: "asset", media: [] }, annotations: { control: "file_picker" }, may_be_unset: false }, surface: "node", studio };
  control.pin = pin;
  control.state = state;
  control.value = value;
  document.body.append(control);
  return control;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the Asset file picker", () => {
  it("is the class the Studio registers as the file picker of an Asset input", () => {
    expectTypeOf(AssetFilePicker).toExtend<InputControlElementClass<"asset">>();
  });

  it("names the asset held by its file name, or by its UUID where the project lists none", () => {
    const { studio } = studioOfTheDemoProject({ kind: "ended", because: "closed" });
    const control = mountedFilePicker(studio, { asset: LUT });
    const button = partOf<HTMLButtonElement>(control, ".file-picker");
    expect(button.textContent).toBe("warm.cube");
    expect(button.getAttribute("aria-label")).toBe("Choose a file for LUT: warm.cube");
    control.value = { asset: "unlisted-uuid" };
    expect(button.textContent).toBe("unlisted-uuid");
  });

  it("opens the Studio's asset picker on a press, with the asset held, and fires one change for another asset chosen", async () => {
    const { studio, picks } = studioOfTheDemoProject({ kind: "chosen", asset: GRADE });
    const control = mountedFilePicker(studio, { asset: LUT });
    const fired = eventsFiredBy(control);
    const button = partOf<HTMLButtonElement>(control, ".file-picker");
    button.click();
    expect(button.disabled).toBe(true);
    await vi.waitFor(() => expect(fired).toEqual([{ name: "change", value: { asset: GRADE } }]));
    expect(picks).toEqual([{ media: null, chosen_now: LUT }]);
    expect(button.textContent).toBe("cold.cube");
    expect(button.disabled).toBe(false);
  });

  it("fires nothing when the picker ends with the asset held or none, and shows why a picker could not start", async () => {
    const { studio } = studioOfTheDemoProject({ kind: "chosen", asset: LUT });
    const control = mountedFilePicker(studio, { asset: LUT });
    const fired = eventsFiredBy(control);
    partOf<HTMLButtonElement>(control, ".file-picker").click();
    await vi.waitFor(() => expect(partOf<HTMLButtonElement>(control, ".file-picker").disabled).toBe(false));
    expect(fired).toEqual([]);

    const refused = mountedFilePicker(studioOfTheDemoProject({ kind: "not_started", because: "No project is open to choose an asset of." }).studio, { asset: LUT });
    partOf<HTMLButtonElement>(refused, ".file-picker").click();
    const refusal = partOf(refused, ".file-picker-refusal");
    await vi.waitFor(() => expect(refusal.hidden).toBe(false));
    expect(refusal.textContent).toBe("No project is open to choose an asset of.");
  });

  it("opens no picker while the input is not editable", () => {
    const { studio, picks } = studioOfTheDemoProject({ kind: "chosen", asset: GRADE });
    const control = mountedFilePicker(studio, { asset: LUT }, "read_only");
    const button = partOf<HTMLButtonElement>(control, ".file-picker");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("LUT: warm.cube");
    button.click();
    expect(picks).toEqual([]);
  });
});
