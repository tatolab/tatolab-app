import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readTatolabViewManifest } from "./tatolab_view_manifest.js";

/** One manifest of `tatolab_view_contract_examples.json` and how view contract 1.0 judges it; the runtime's reader is held to the same file. */
type TatolabViewContractExample = {
  named: string;
  manifest: unknown;
  opens: boolean;
  refused_at?: string;
  reads_as?: unknown;
};

const contractExamples: { examples: TatolabViewContractExample[] } = JSON.parse(
  await readFile(
    new URL("../tatolab_view_contract_examples.json", import.meta.url),
    "utf8",
  ),
);

describe("tatolab_view_contract_examples.json", () => {
  it.each(contractExamples.examples)(
    "$named",
    ({ manifest, opens, refused_at, reads_as }) => {
      const reading = readTatolabViewManifest(manifest);
      if (opens) {
        expect(
          reading.kind,
          reading.kind === "not_read" ? reading.because : "",
        ).toBe("read");
        if (reads_as !== undefined && reading.kind === "read")
          expect(reading.manifest).toEqual(reads_as);
        return;
      }
      expect(reading.kind).toBe("not_read");
      if (refused_at !== undefined && reading.kind === "not_read")
        expect(reading.because).toContain(`\`${refused_at}\`:`);
    },
  );
});
