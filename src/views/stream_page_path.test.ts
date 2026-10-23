// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { expect, test } from "vitest";
import { previewedOutputAskedBy, streamPagePath, streamPageTabNamed, streamPageTabShownAt } from "./stream_page_path";

test("a stream's page is its Overview, and each other tab a path below it", () => {
  expect(streamPagePath("front door")).toBe("/streams/front%20door");
  expect(streamPagePath("main", "inspect")).toBe("/streams/main/inspect");
  expect(streamPageTabNamed(undefined)).toBe("overview");
  expect(streamPageTabNamed("logs")).toBe("logs");
  expect(streamPageTabNamed("overview")).toBeNull();
  expect(streamPageTabNamed("outputs")).toBeNull();
  expect(streamPageTabShownAt("/streams/main/graph")).toBe("graph");
  expect(streamPageTabShownAt("/streams/main")).toBe("overview");
  expect(streamPageTabShownAt("/settings")).toBeNull();
});

test("only a navigation state naming a node and a port asks for a previewed output", () => {
  expect(previewedOutputAskedBy({ previewedOutput: { node: "h264encoder", port: "encoded_video" } })).toEqual({ node: "h264encoder", port: "encoded_video" });
  expect(previewedOutputAskedBy({ previewedOutput: { node: "h264encoder" } })).toBeNull();
  expect(previewedOutputAskedBy(null)).toBeNull();
  expect(previewedOutputAskedBy("main")).toBeNull();
});
