import { expect, test } from "vitest";
import { streamDisplayNameRefusal } from "./stream_menu_presentation";

test("a stream's name is refused before the runtime is asked only when it shows nothing", () => {
  expect(streamDisplayNameRefusal("")).toBe("Give the stream a name.");
  expect(streamDisplayNameRefusal(" \t ")).toBe("Give the stream a name.");
  expect(streamDisplayNameRefusal("Lobby preview")).toBeNull();
  expect(streamDisplayNameRefusal("  main ")).toBeNull();
});
