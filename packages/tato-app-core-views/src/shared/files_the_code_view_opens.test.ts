import { expect, test } from "vitest";
import { isAFileTheCodeViewOpens } from "./files_the_code_view_opens";

test("Code opens the files its manifest accepts and no other", () => {
  for (const file of ["/w/gallery/nodes/glow.py", "pyproject.toml", "stubs/frame.pyi", "streams/main.graph.json", "README.md"]) expect(isAFileTheCodeViewOpens(file)).toBe(true);
  for (const file of ["views/deck/logo.png", ".gitignore", ".python-version", "/w/gallery/nodes/.py", "clip.mp4"]) expect(isAFileTheCodeViewOpens(file)).toBe(false);
});
