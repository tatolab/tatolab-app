import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { failedWith } from "../../result.js";
import { CommandLineToolLinkedByTheInstaller, LINUX_INSTALLER_LINKS_THE_COMMAND } from "./command_line_tool_linked_by_the_installer.js";

const temporaryHomeDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryHomeDirectories.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

test("the_cli_reads_linked_only_while_the_installers_link_resolves", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "tl-app-home-"));
  temporaryHomeDirectories.push(home);
  const linkPath = path.join(home, ".local/bin/tatolab");
  const installedCommandLineTool = path.join(home, ".local/share/tatolab/0.46.0/bin/tatolab");
  const commandLineToolLinks = new CommandLineToolLinkedByTheInstaller(linkPath);
  const observedLink = async () => {
    const observation = await commandLineToolLinks.observeCommandLineToolLinks();
    expect(observation.usrLocalBinLink).toEqual({ kind: "not_offered", reason: LINUX_INSTALLER_LINKS_THE_COMMAND });
    return observation.homeFolderLinkedAt;
  };

  expect(await observedLink()).toBeNull();

  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(installedCommandLineTool, linkPath);
  expect(await observedLink(), "a dangling link runs nothing").toBeNull();

  await mkdir(path.dirname(installedCommandLineTool), { recursive: true });
  await writeFile(installedCommandLineTool, "");
  expect(await observedLink()).toBe(linkPath);
});

test("the_app_links_nothing_on_linux", async () => {
  const commandLineToolLinks = new CommandLineToolLinkedByTheInstaller(null);

  expect(await commandLineToolLinks.linkTheCommandLineToolInUsrLocalBin()).toEqual(
    failedWith({ kind: "not_offered", reason: LINUX_INSTALLER_LINKS_THE_COMMAND }),
  );
  expect((await commandLineToolLinks.observeCommandLineToolLinks()).homeFolderLinkedAt).toBeNull();
});
