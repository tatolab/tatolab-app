// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { runtimeLoopbackHttpOriginFor, runtimeWatchPageUrl } from "./runtime_loopback_watch_page.js";

test("a_release_build_reads_the_runtimes_fixed_loopback_address_and_a_local_proof_build_its_test_port", () => {
  expect(runtimeLoopbackHttpOriginFor(false)).toBe("http://127.0.0.1:4446");
  expect(runtimeLoopbackHttpOriginFor(true)).toBe("http://127.0.0.1:14446");
});

test("an_outputs_preview_page_names_each_part_of_its_address_as_one_path_segment", () => {
  expect(runtimeWatchPageUrl("http://127.0.0.1:4446", { machine: "desk", stream: "front door", node: "a/b", port: "video" })).toBe(
    "http://127.0.0.1:4446/watch/desk/front%20door/a%2Fb/video",
  );
});
