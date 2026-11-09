import type { ViewSettings } from "@tatolab/tato-app-view-sdk";

/** The rows a tree view's area keeps opened or closed, from its `row_expansion` setting, by row id. */
export type RowExpansionChoices = { [rowId: string]: boolean };

/** The `row_expansion` setting of `settings`, with any entry that is not true or false left out. */
export function rowExpansionChoicesOf(settings: ViewSettings | null): RowExpansionChoices {
  const rowExpansion = settings?.["row_expansion"];
  if (typeof rowExpansion !== "object" || rowExpansion === null || Array.isArray(rowExpansion)) return {};
  return Object.fromEntries(Object.entries(rowExpansion).filter((choice): choice is [string, boolean] => typeof choice[1] === "boolean"));
}
