// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { tatolabAppUpdatePackagingOnMacos } from "./mod.js";

test("a packaged app updates through Squirrel.Mac, and an unpackaged one, running from Electron's bundle, updates nothing", () => {
  expect(tatolabAppUpdatePackagingOnMacos(true)).toEqual({ kind: "squirrel_mac_zip" });
  expect(tatolabAppUpdatePackagingOnMacos(false)).toEqual({ kind: "not_offered", reason: "Only a packaged Tatolab updates itself." });
});
