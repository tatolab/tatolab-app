import type { JsonValue, ViewSettings } from "@tatolab/tato-app-view-sdk";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import type { RowExpansionChoices } from "./row_expansion_settings";
import { useRowExpansionKeptInSettings } from "./row_expansion_kept_in_settings";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function drawTheRowExpansion(settings: ViewSettings | null, settingsRemembered: JsonValue[]) {
  const drawn: { choices: RowExpansionChoices; toggleTheRow: (rowId: string, expand: boolean) => void } = { choices: {}, toggleTheRow: () => undefined };
  function RowExpansionReader({ settingsNow }: { settingsNow: ViewSettings | null }) {
    const [choices, toggleTheRow] = useRowExpansionKeptInSettings(async (rememberedSettings) => {
      settingsRemembered.push(rememberedSettings);
      return { kind: "done" };
    }, settingsNow);
    drawn.choices = choices;
    drawn.toggleTheRow = toggleTheRow;
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<RowExpansionReader settingsNow={settings} />));
  return { drawn, settingsArrive: (settingsNow: ViewSettings | null) => act(() => root.render(<RowExpansionReader settingsNow={settingsNow} />)) };
}

test("two toggles before Studio answers both stay, drawn at once and sent one on top of the other", () => {
  const settingsRemembered: JsonValue[] = [];
  const { drawn } = drawTheRowExpansion({ row_expansion: { imports: true } }, settingsRemembered);
  act(() => drawn.toggleTheRow("node_types", true));
  act(() => drawn.toggleTheRow("imports", false));
  expect(drawn.choices).toEqual({ imports: false, node_types: true });
  expect(settingsRemembered).toEqual([{ row_expansion: { imports: true, node_types: true } }, { row_expansion: { imports: false, node_types: true } }]);
});

test("the settings Studio reads back replace the rows drawn", () => {
  const { drawn, settingsArrive } = drawTheRowExpansion(null, []);
  act(() => drawn.toggleTheRow("node_types", true));
  settingsArrive({ row_expansion: { imports: true } });
  expect(drawn.choices).toEqual({ imports: true });
});
