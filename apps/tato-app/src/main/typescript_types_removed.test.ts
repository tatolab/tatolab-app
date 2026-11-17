import { Effect } from "effect";
import { expect, test } from "vitest";
import { typeScriptWithItsTypesRemoved } from "./typescript_types_removed.js";

/** What stopped the bytes `typeScriptBytes` of the file at `pathInTheProject` from losing their types. */
function refusalOf(pathInTheProject: string, typeScriptBytes: Uint8Array) {
  return Effect.runPromise(Effect.flip(typeScriptWithItsTypesRemoved(pathInTheProject, typeScriptBytes)));
}

test("types are blanked where they stand, so every line and column stays the author's", async () => {
  const typeScriptText = "type Level = number;\nexport const half = (level: Level): Level => level / 2;\n";
  const javaScriptText = await Effect.runPromise(typeScriptWithItsTypesRemoved("views/meter/half.ts", Buffer.from(typeScriptText)));

  expect(javaScriptText).toBe("                    \nexport const half = (level       )        => level / 2;\n");
  expect(javaScriptText.split("\n").map((line) => line.length)).toEqual(typeScriptText.split("\n").map((line) => line.length));
});

test("an enum, a parameter property, a namespace and JSX are refused with the file and the line", async () => {
  expect(await refusalOf("views/meter/lanes.ts", Buffer.from("const tracks = 2;\n\nenum Lane { Left }\n"))).toMatchObject({
    line: 3,
    words: "views/meter/lanes.ts, line 3: TypeScript enum is not supported in strip-only mode",
  });
  expect(await refusalOf("views/meter/fader.ts", Buffer.from("class Fader {\n  constructor(private level: number) {}\n}\n"))).toMatchObject({
    line: 2,
    words: "views/meter/fader.ts, line 2: TypeScript parameter property is not supported in strip-only mode",
  });
  expect(await refusalOf("views/meter/levels.ts", Buffer.from("namespace Levels {\n  export const top = 1;\n}\n"))).toMatchObject({ line: 1 });
  expect(await refusalOf("views/meter/panel.ts", Buffer.from("const name = 1;\nconst panel = <div>{name}</div>;\n"))).toMatchObject({ line: 2 });
});

test("a file that is not UTF-8 text is refused with no line", async () => {
  expect(await refusalOf("views/meter/meter.ts", new Uint8Array([0x63, 0x6f, 0xff, 0xfe]))).toMatchObject({ line: null, words: "views/meter/meter.ts is not UTF-8 text." });
});
