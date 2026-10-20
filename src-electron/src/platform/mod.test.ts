// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { LOCAL_API_SOCKET_FILE_NAME, localApiSocketUnderALocalProofTestRoot, perUserStreamlibRuntimeDirectoryUnderTmp } from "./mod.js";
import path from "node:path";

test("the_local_api_socket_sits_where_the_runtime_serves_it", () => {
  expect(path.join(perUserStreamlibRuntimeDirectoryUnderTmp(501), LOCAL_API_SOCKET_FILE_NAME)).toBe("/tmp/streamlib-501/local-api.sock");
  expect(localApiSocketUnderALocalProofTestRoot("/tmp/tatolab-proof")).toBe("/tmp/tatolab-proof/run/local-api.sock");
});
