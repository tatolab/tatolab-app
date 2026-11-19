import type { NodeUiElementHost } from "@tatolab/tato-app-view-sdk/node_ui";
import type { ProjectAControlReaches } from "@tatolab/tato-app-view-sdk/pin_services/input_control_binding";

/** The Studio a control under test is mounted in: it answers no call. */
export const NO_STUDIO_CALLS: NodeUiElementHost = {
  pickAProjectAsset: () => Promise.resolve({ kind: "not_started", because: "no Studio in this test" }),
  readAssetPreview: () => Promise.resolve({ kind: "not_read", because: "no Studio in this test" }),
  watchProjectAssets: () => () => undefined,
  inputControlFor: () => Promise.reject(new Error("no Studio in this test")),
};

/** The project a binder under test reaches: it picks nothing, reads no preview and lists no asset. */
export const NO_PROJECT: ProjectAControlReaches = {
  pickAProjectAsset: () => Promise.resolve({ kind: "not_started", because: "no project in this test" }),
  readAssetPreviewInTheProject: () => Promise.resolve({ kind: "not_read", because: "no project in this test" }),
  watchProjectAssets: () => () => undefined,
};

/** Each `input` and `change` `control` fires, with the value its detail carries. */
export function eventsFiredBy(control: HTMLElement): { name: string; value: unknown }[] {
  const fired: { name: string; value: unknown }[] = [];
  for (const name of ["input", "change"]) {
    control.addEventListener(name, (event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (typeof detail === "object" && detail !== null && "value" in detail) fired.push({ name, value: detail.value });
    });
  }
  return fired;
}

/** The one element in `control`'s shadow root that `selector` finds. */
export function partOf<Part extends Element = HTMLElement>(control: HTMLElement, selector: string): Part {
  const part = control.shadowRoot?.querySelector<Part>(selector);
  if (part === null || part === undefined) throw new Error(`the control draws no ${selector}`);
  return part;
}
