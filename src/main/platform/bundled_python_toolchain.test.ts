import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { bundledPythonToolchainFoundAt, NO_BUNDLED_PYTHON_TOOLCHAIN_REFUSAL, pythonVersionOfTheBuiltInPythonFolder } from "./bundled_python_toolchain.js";
import { builtInPythonCopiesFolderOnLinux, pythonToolchainInTheAppResources } from "./linux/python_toolchain_in_the_app_resources.js";
import { pythonToolchainInTheAppBundle } from "./macos/python_toolchain_in_the_app_bundle.js";

const temporaryFolders: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function temporaryFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(os.tmpdir(), "tl-app-toolchain-"));
  temporaryFolders.push(folder);
  return folder;
}

test("the built-in Python's version is read from python-build-standalone's folder name", () => {
  expect(pythonVersionOfTheBuiltInPythonFolder("cpython-3.12.12+20251014")).toBe("3.12.12");
  expect(pythonVersionOfTheBuiltInPythonFolder("cpython-3.13.1")).toBe("3.13.1");
  expect(pythonVersionOfTheBuiltInPythonFolder("python")).toBeNull();
});

test("the toolchain is found with its uv and its one built-in Python folder, and not offered when either is missing", async () => {
  const appResources = await temporaryFolder();
  const uvPath = path.join(appResources, "uv");
  const pythonParent = path.join(appResources, "python");
  const copiesFolder = "/home/someone/.local/share/com.tatolab.tatolab/python";

  const withNoUv = await bundledPythonToolchainFoundAt(uvPath, pythonParent, copiesFolder);
  expect(withNoUv).toEqual({ kind: "not_offered", reason: `${NO_BUNDLED_PYTHON_TOOLCHAIN_REFUSAL} (no uv at ${uvPath})` });

  await writeFile(uvPath, "uv", { mode: 0o755 });
  const withNoPython = await bundledPythonToolchainFoundAt(uvPath, pythonParent, copiesFolder);
  expect(withNoPython).toEqual({ kind: "not_offered", reason: `${NO_BUNDLED_PYTHON_TOOLCHAIN_REFUSAL} (${pythonParent} holds 0 built-in Pythons, not one)` });

  await mkdir(path.join(pythonParent, "cpython-3.12.12+20251014"), { recursive: true });
  expect(await bundledPythonToolchainFoundAt(uvPath, pythonParent, copiesFolder)).toEqual({
    kind: "in_the_app",
    uvPath,
    builtInPythonInTheApp: path.join(pythonParent, "cpython-3.12.12+20251014"),
    builtInPythonFolderName: "cpython-3.12.12+20251014",
    builtInPythonCopiesFolder: copiesFolder,
  });

  await mkdir(path.join(pythonParent, "cpython-3.13.1+20251014"), { recursive: true });
  const withTwoPythons = await bundledPythonToolchainFoundAt(uvPath, pythonParent, copiesFolder);
  expect(withTwoPythons.kind).toBe("not_offered");
});

test("macOS finds uv beside the app binary and the Python in the bundle's Resources, copying it into the app's config directory", async () => {
  const appBundle = path.join(await temporaryFolder(), "Tatolab.app");
  const appExecutable = path.join(appBundle, "Contents", "MacOS", "Tatolab");
  await mkdir(path.join(appBundle, "Contents", "Resources", "python", "cpython-3.12.12+20251014"), { recursive: true });
  await mkdir(path.dirname(appExecutable), { recursive: true });
  await writeFile(appExecutable, "the app");
  await writeFile(path.join(appBundle, "Contents", "MacOS", "uv"), "uv");
  const appConfigDirectory = "/Users/someone/Library/Application Support/com.tatolab.tatolab";

  const toolchain = await pythonToolchainInTheAppBundle(appExecutable, true, appConfigDirectory);

  expect(toolchain).toMatchObject({
    kind: "in_the_app",
    builtInPythonFolderName: "cpython-3.12.12+20251014",
    builtInPythonCopiesFolder: path.join(appConfigDirectory, "python"),
  });
  expect((await pythonToolchainInTheAppBundle(appExecutable, false, appConfigDirectory)).kind).toBe("not_offered");
});

test("Linux finds both in the package's resources and copies the Python into the XDG data folder", async () => {
  expect(builtInPythonCopiesFolderOnLinux(undefined, "/home/someone")).toBe("/home/someone/.local/share/com.tatolab.tatolab/python");
  expect(builtInPythonCopiesFolderOnLinux("/data/someone", "/home/someone")).toBe("/data/someone/com.tatolab.tatolab/python");
  expect(builtInPythonCopiesFolderOnLinux("relative/data", "/home/someone")).toBe("/home/someone/.local/share/com.tatolab.tatolab/python");

  const appResources = await temporaryFolder();
  await mkdir(path.join(appResources, "python", "cpython-3.12.12+20251014"), { recursive: true });
  await writeFile(path.join(appResources, "uv"), "uv");
  const copiesFolder = "/home/someone/.local/share/com.tatolab.tatolab/python";

  expect(await pythonToolchainInTheAppResources(true, appResources, copiesFolder)).toMatchObject({ kind: "in_the_app", uvPath: path.join(appResources, "uv") });
  expect((await pythonToolchainInTheAppResources(false, appResources, copiesFolder)).kind).toBe("not_offered");
});
