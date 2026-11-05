import { randomUUID } from "node:crypto";
import { mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { CommandLineToolLinkInTheHomeFolder, commandLineToolLinkTakenRefusal } from "./command_line_tool_link_in_the_home_folder.js";

const homeFolder = path.join(os.tmpdir(), `tl-home-${randomUUID()}`);
const linkPath = path.join(homeFolder, ".local", "bin", "tatolab");
const carriedCommandLineTool = "/Applications/Tato Studio.app/Contents/Helpers/Tatolab Runtime.app/Contents/MacOS/tatolab-cli";

afterEach(async () => {
  await rm(homeFolder, { recursive: true, force: true });
});

test("a_missing_link_is_made_with_its_folder_and_then_reads_as_linked", async () => {
  const commandLineToolLink = CommandLineToolLinkInTheHomeFolder.at(linkPath, carriedCommandLineTool);
  expect(await commandLineToolLink.observeTheLink()).toEqual({ kind: "not_linked", path: linkPath });
  expect(await commandLineToolLink.linkTheCommandLineTool()).toEqual({ ok: true, value: undefined });
  expect(await readlink(linkPath)).toBe(carriedCommandLineTool);
  expect(await commandLineToolLink.observeTheLink()).toEqual({ kind: "linked", path: linkPath });
});

test("a_link_to_the_retired_installers_tatolab_is_replaced", async () => {
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(path.join(homeFolder, "Library", "Application Support", "com.tatolab.runtime", "current", "Tatolab Runtime.app", "Contents", "MacOS", "tatolab-cli"), linkPath);
  const commandLineToolLink = CommandLineToolLinkInTheHomeFolder.at(linkPath, carriedCommandLineTool);
  expect(await commandLineToolLink.observeTheLink()).toEqual({ kind: "not_linked", path: linkPath });
  expect(await commandLineToolLink.linkTheCommandLineTool()).toEqual({ ok: true, value: undefined });
  expect(await readlink(linkPath)).toBe(carriedCommandLineTool);
});

test("a_file_that_is_not_a_link_to_tatolab_is_left_alone", async () => {
  await mkdir(path.dirname(linkPath), { recursive: true });
  await writeFile(linkPath, "#!/bin/sh\necho someone else's tatolab\n");
  const commandLineToolLink = CommandLineToolLinkInTheHomeFolder.at(linkPath, carriedCommandLineTool);
  expect(await commandLineToolLink.observeTheLink()).toEqual({ kind: "taken_by_something_else", path: linkPath });
  expect(await commandLineToolLink.linkTheCommandLineTool()).toEqual({ ok: false, failure: commandLineToolLinkTakenRefusal(linkPath) });
});

test("a_build_that_offers_no_link_says_why", async () => {
  const commandLineToolLink = CommandLineToolLinkInTheHomeFolder.notOffered("This build of Tato Studio carries no tatolab command.");
  expect(await commandLineToolLink.observeTheLink()).toEqual({ kind: "not_offered", reason: "This build of Tato Studio carries no tatolab command." });
  expect(await commandLineToolLink.linkTheCommandLineTool()).toEqual({ ok: false, failure: "This build of Tato Studio carries no tatolab command." });
});
