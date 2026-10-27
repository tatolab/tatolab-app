import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { LARGEST_RELAY_SECRET_FILE_BYTES, readTheRelaySecretFileThePersonChooses } from "./relay_secret_file_reading.js";
import { failedWith, succeeded } from "./result.js";

const cleanUps: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(cleanUps.splice(0).map((cleanUp) => cleanUp()));
});

async function aFileHolding(fileName: string, contents: string | Buffer): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "tl-relay-secret-"));
  cleanUps.push(() => rm(folder, { recursive: true, force: true }));
  const filePath = path.join(folder, fileName);
  await writeFile(filePath, contents);
  return filePath;
}

test("the_chosen_files_text_is_answered_whole_as_moq_pro_downloads_a_signing_key", async () => {
  const signingKey = '{"kty":"OKP","crv":"Ed25519","kid":"pb1studio","d":"written-for-the-test"}\n';
  const filePath = await aFileHolding("pb1studio.jwk", signingKey);

  expect(await readTheRelaySecretFileThePersonChooses(async () => succeeded(filePath))).toEqual(succeeded({ text: signingKey }));
});

test("a_cancelled_dialog_answers_nothing_and_a_dialog_that_did_not_open_is_refused_in_its_words", async () => {
  expect(await readTheRelaySecretFileThePersonChooses(async () => succeeded(null))).toEqual(succeeded(null));
  expect(await readTheRelaySecretFileThePersonChooses(async () => failedWith("The file dialog did not open: no window"))).toEqual(
    failedWith("The file dialog did not open: no window"),
  );
});

test("a_file_larger_than_a_secret_or_not_text_is_refused_by_its_name_and_never_by_its_contents", async () => {
  const tooLarge = await aFileHolding("video.mp4", Buffer.alloc(LARGEST_RELAY_SECRET_FILE_BYTES + 1, 0x61));
  const notText = await aFileHolding("key.der", Buffer.from([0xff, 0xfe, 0x00, 0x81]));

  const tooLargeRefusal = await readTheRelaySecretFileThePersonChooses(async () => succeeded(tooLarge));
  const notTextRefusal = await readTheRelaySecretFileThePersonChooses(async () => succeeded(notText));

  expect(tooLargeRefusal).toEqual(failedWith(`${tooLarge} is 65537 bytes, larger than a relay secret, which Tatolab reads up to 65536 bytes of.`));
  expect(notTextRefusal).toEqual(failedWith(`${notText} is not text, so it holds no secret Tatolab can send.`));
  expect((await readTheRelaySecretFileThePersonChooses(async () => succeeded("/nowhere/at/all.jwk"))).ok).toBe(false);
});
