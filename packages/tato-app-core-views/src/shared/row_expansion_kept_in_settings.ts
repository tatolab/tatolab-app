import type { TatoAppViewConnection, ViewSettings } from "@tatolab/tato-app-view-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { rowExpansionChoicesOf, type RowExpansionChoices } from "./row_expansion_settings";

/**
 * A tree view's opened and closed rows, kept in its area's `row_expansion` setting: a toggle draws at once and is sent
 * on top of every toggle before it, so two toggles before Studio answers both stay; each settings reading replaces them.
 */
export function useRowExpansionKeptInSettings(
  rememberSettings: TatoAppViewConnection["rememberSettings"],
  settings: ViewSettings | null,
): [RowExpansionChoices, (rowId: string, expand: boolean) => void] {
  const [expansionChoices, setExpansionChoices] = useState(() => rowExpansionChoicesOf(settings));
  const latestExpansionChoices = useRef(expansionChoices);
  useEffect(() => {
    const choicesInTheSettings = rowExpansionChoicesOf(settings);
    latestExpansionChoices.current = choicesInTheSettings;
    setExpansionChoices(choicesInTheSettings);
  }, [settings]);
  const toggleTheRow = useCallback(
    (rowId: string, expand: boolean) => {
      const toggledChoices = { ...latestExpansionChoices.current, [rowId]: expand };
      latestExpansionChoices.current = toggledChoices;
      setExpansionChoices(toggledChoices);
      void rememberSettings({ row_expansion: toggledChoices });
    },
    [rememberSettings],
  );
  return [expansionChoices, toggleTheRow];
}
