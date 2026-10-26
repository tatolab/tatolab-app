import { expect, test } from "vitest";
import { tatolabAppUpdatePackagingOnMacos } from "./tatolab_app_update_packaging_on_macos.js";

test("a packaged app updates through Squirrel.Mac, and an unpackaged one, running from Electron's bundle, updates nothing", () => {
  expect(tatolabAppUpdatePackagingOnMacos(true)).toEqual({ kind: "squirrel_mac_zip" });
  expect(tatolabAppUpdatePackagingOnMacos(false)).toEqual({ kind: "not_offered", reason: "Only a packaged Tatolab updates itself." });
});
