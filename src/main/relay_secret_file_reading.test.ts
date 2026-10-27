import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { LARGEST_RELAY_SECRET_FILE_BYTES, readTheRelaySecretFileThePersonChooses, relaySecretFromTheFilesText } from "./relay_secret_file_reading.js";
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

test("the_chosen_files_text_and_name_are_answered_its_one_trailing_line_ending_dropped_as_the_cli_reads_one", async () => {
  const signingKey = '{\n  "kty": "OKP",\n  "kid": "pb1studio",\n  "d": "written-for-the-test"\n}';
  const filePath = await aFileHolding("pb1studio.jwk", `${signingKey}\n`);

  expect(await readTheRelaySecretFileThePersonChooses(async () => succeeded(filePath))).toEqual(succeeded({ text: signingKey, file_name: "pb1studio.jwk" }));
  expect(["token\r\n", "token\n", "token", "token\n\n"].map(relaySecretFromTheFilesText)).toEqual(["token", "token", "token", "token\n"]);
});

test("an_empty_file_is_refused_by_its_name_as_the_cli_refuses_an_empty_secret", async () => {
  const emptyFile = await aFileHolding("empty.jwk", "\n");

  expect(await readTheRelaySecretFileThePersonChooses(async () => succeeded(emptyFile))).toEqual(failedWith(`${emptyFile} is empty, so it holds no secret Tatolab can send.`));
});

test("a_fifo_is_refused_without_waiting_for_a_writer", { timeout: 5_000 }, async () => {
  const fifo = path.join(path.dirname(await aFileHolding("anything.txt", "x")), "secret.fifo");
  const madeTheFifo = await new Promise<boolean>((settle) => execFile("mkfifo", [fifo], (failure) => settle(failure === null)));
  if (!madeTheFifo) return;

  expect(await readTheRelaySecretFileThePersonChooses(async () => succeeded(fifo))).toEqual(failedWith(`${fifo} is not a file, so it holds no secret Tatolab can send.`));
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

  expect(tooLargeRefusal).toEqual(failedWith(`${tooLarge} is larger than a relay secret, which Tatolab reads up to 65536 bytes of.`));
  expect(notTextRefusal).toEqual(failedWith(`${notText} is not text, so it holds no secret Tatolab can send.`));
  expect(await readTheRelaySecretFileThePersonChooses(async () => succeeded("/nowhere/at/all.jwk"))).toEqual(failedWith("/nowhere/at/all.jwk could not be read: ENOENT"));
});

test("only_a_regular_file_is_read_so_a_folder_or_a_device_never_holds_the_answer_up", async () => {
  const folder = path.dirname(await aFileHolding("anything.txt", "x"));

  expect(await readTheRelaySecretFileThePersonChooses(async () => succeeded(folder))).toEqual(failedWith(`${folder} is not a file, so it holds no secret Tatolab can send.`));
  expect(await readTheRelaySecretFileThePersonChooses(async () => succeeded("/dev/zero"))).toEqual(failedWith("/dev/zero is not a file, so it holds no secret Tatolab can send."));
});
