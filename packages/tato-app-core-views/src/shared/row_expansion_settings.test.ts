import { expect, test } from "vitest";
import { rowExpansionChoicesOf } from "./row_expansion_settings";

test("reads the rows an area keeps opened or closed, leaving out what is not true or false", () => {
  expect(rowExpansionChoicesOf({ row_expansion: { "stream:main": true, imports: false, odd: "yes" } })).toEqual({ "stream:main": true, imports: false });
  expect(rowExpansionChoicesOf(null)).toEqual({});
  expect(rowExpansionChoicesOf({ row_expansion: [] })).toEqual({});
});
