import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { succeeded } from "../../result.js";
import { createTatolabAppLog } from "../../tatolab_app_log.js";
import {
  autostartDesktopEntryOpensAtLogin,
  desktopEntryExecArgument,
  XdgAutostartDesktopEntry,
  xdgAutostartDirectory,
} from "./xdg_autostart_desktop_entry.js";

const temporaryDirectories: string[] = [];
const quietTatolabAppLog = createTatolabAppLog("error", () => {});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryConfigHome(): Promise<string> {
  const configHome = await mkdtemp(path.join(os.tmpdir(), "tl-app-xdg-config-"));
  temporaryDirectories.push(configHome);
  return configHome;
}

test("the_autostart_folder_is_under_xdg_config_home_and_falls_back_to_dot_config_when_it_is_unset_empty_or_relative", () => {
  expect(xdgAutostartDirectory("/home/u/.xdg", "/home/u")).toBe("/home/u/.xdg/autostart");
  expect(xdgAutostartDirectory(undefined, "/home/u")).toBe("/home/u/.config/autostart");
  expect(xdgAutostartDirectory("", "/home/u")).toBe("/home/u/.config/autostart");
  expect(xdgAutostartDirectory("relative/config", "/home/u")).toBe("/home/u/.config/autostart");
});

test("a_program_path_is_one_exec_argument_quoted_and_escaped_only_where_the_spec_needs_it", () => {
  expect(desktopEntryExecArgument("/usr/lib/tatolab/Tatolab")).toBe("/usr/lib/tatolab/Tatolab");
  expect(desktopEntryExecArgument("/home/u/Apps/Tatolab 0.55.2.AppImage")).toBe('"/home/u/Apps/Tatolab 0.55.2.AppImage"');
  expect(desktopEntryExecArgument('/home/u/odd "$name`\\.AppImage')).toBe('"/home/u/odd \\\\"\\\\$name\\\\`\\\\\\\\.AppImage"');
});

test("turning_it_on_writes_an_entry_that_opens_the_app_and_off_removes_it", async () => {
  const autostartDirectory = path.join(await temporaryConfigHome(), "autostart");
  const autostartEntry = new XdgAutostartDesktopEntry(autostartDirectory, "/home/u/Apps/Tatolab.AppImage", quietTatolabAppLog);
  expect(await autostartEntry.readOpenAtLogin()).toEqual({ kind: "off" });

  expect(await autostartEntry.setOpenAtLogin(true)).toEqual(succeeded(undefined));
  const desktopEntryText = await readFile(path.join(autostartDirectory, "Tatolab.desktop"), "utf8");
  expect(desktopEntryText).toContain("[Desktop Entry]\nType=Application\nName=Tato Studio\n");
  expect(desktopEntryText).toContain("\nExec=/home/u/Apps/Tatolab.AppImage\n");
  expect(await autostartEntry.readOpenAtLogin()).toEqual({ kind: "on" });

  expect(await autostartEntry.setOpenAtLogin(false)).toEqual(succeeded(undefined));
  expect(await autostartEntry.readOpenAtLogin()).toEqual({ kind: "off" });
  expect(await autostartEntry.setOpenAtLogin(false)).toEqual(succeeded(undefined));
});

test("an_entry_the_desktop_was_told_to_skip_reads_off", async () => {
  expect(autostartDesktopEntryOpensAtLogin("[Desktop Entry]\nExec=Tatolab\nHidden=true\n")).toBe(false);
  expect(autostartDesktopEntryOpensAtLogin("[Desktop Entry]\nExec=Tatolab\nX-GNOME-Autostart-enabled=false\n")).toBe(false);
  expect(autostartDesktopEntryOpensAtLogin("[Desktop Entry]\nExec=Tatolab\n")).toBe(true);

  const autostartDirectory = path.join(await temporaryConfigHome(), "autostart");
  await mkdir(autostartDirectory);
  await writeFile(path.join(autostartDirectory, "Tatolab.desktop"), "[Desktop Entry]\nExec=Tatolab\nHidden=true\n");
  expect(await new XdgAutostartDesktopEntry(autostartDirectory, "/usr/lib/tatolab/Tatolab", quietTatolabAppLog).readOpenAtLogin()).toEqual({ kind: "off" });
});

test.skipIf(process.getuid?.() === 0)("an_entry_that_cannot_be_written_is_refused_naming_where_and_why", async () => {
  const configHome = await temporaryConfigHome();
  await chmod(configHome, 0o500);
  const set = await new XdgAutostartDesktopEntry(path.join(configHome, "autostart"), "/usr/lib/tatolab/Tatolab", quietTatolabAppLog).setOpenAtLogin(true);
  await chmod(configHome, 0o700);

  expect(!set.ok && set.failure.startsWith(`Tato Studio could not write ${path.join(configHome, "autostart", "Tatolab.desktop")}: `)).toBe(true);
});
