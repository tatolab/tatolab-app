// A stand-in for the extension SDK kit the SDK's build writes, holding the parts the runtime looks
// for before it takes a folder as a kit.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Plants a stand-in kit at `<directory>/extension-sdk-kit`, and answers its path. */
export async function anExtensionSdkKitPlantedIn(directory: string): Promise<string> {
  const kit = path.join(directory, "extension-sdk-kit");
  await mkdir(path.join(kit, "check_folder"), { recursive: true });
  await mkdir(path.join(kit, "declarations"), { recursive: true });
  await writeFile(path.join(kit, "package.json"), JSON.stringify({ name: "@tatolab/tato-app-view-sdk", version: "1.2.3" }));
  await writeFile(path.join(kit, "check_folder", "tsconfig.json"), "{}");
  await writeFile(path.join(kit, "tie_lines.json"), "{}");
  await writeFile(path.join(kit, "oxlint.json"), "{}");
  await writeFile(path.join(kit, "tsconfig.preset.json"), "{}");
  await writeFile(path.join(kit, "declarations", "index.d.ts"), "export {};\n");
  return kit;
}
