import { expect, test } from "vitest";
import { projectPagePath, projectPageTabNamed } from "./project_page_path";

test("a project's page is its Streams, with Logs a path below it, the folder held in one path segment", () => {
  expect(projectPagePath("/Users/ada/code/front door")).toBe("/projects/%2FUsers%2Fada%2Fcode%2Ffront%20door");
  expect(projectPagePath("/Users/ada/code/hallways", "logs")).toBe("/projects/%2FUsers%2Fada%2Fcode%2Fhallways/logs");
  expect(projectPageTabNamed(undefined)).toBe("streams");
  expect(projectPageTabNamed("logs")).toBe("logs");
  expect(projectPageTabNamed("streams")).toBeNull();
  expect(projectPageTabNamed("graph")).toBeNull();
});
