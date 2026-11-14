// The machines a Marketplace module's wheels install on, as the catalog's `platforms` names
// them in PEP 508's words, said the way a person reads them.

import type { PackageCatalogMachine } from "./tatolab_backend_contract.js";

const OPERATING_SYSTEM_WORDS_OF_SYS_PLATFORM: Readonly<Record<string, string>> = { darwin: "macOS", linux: "Linux" };

// macOS's `arm64` is Apple silicon; Linux names the same CPU `aarch64`.
const MACHINE_WORDS_OF_PLATFORM_MACHINE: Readonly<Record<string, string>> = { x86_64: "x86-64", aarch64: "ARM64", arm64: "Apple silicon" };

function operatingSystemWordsOf(machine: PackageCatalogMachine): string {
  return OPERATING_SYSTEM_WORDS_OF_SYS_PLATFORM[machine.sys_platform] ?? machine.sys_platform;
}

function joinedWithAnd(words: readonly string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1) ?? ""}`;
}

/** Each machine in words, as "macOS (Apple silicon) and Linux (x86-64)". */
export function catalogMachinesInWords(platforms: readonly PackageCatalogMachine[]): string {
  return joinedWithAnd(platforms.map((machine) => `${operatingSystemWordsOf(machine)} (${MACHINE_WORDS_OF_PLATFORM_MACHINE[machine.platform_machine] ?? machine.platform_machine})`));
}

/** The operating systems alone, each once, behind "only", as "Linux only"; a card's corner has room for no more. */
export function catalogOperatingSystemsOnlyWords(platforms: readonly PackageCatalogMachine[]): string {
  return `${joinedWithAnd([...new Set(platforms.map(operatingSystemWordsOf))])} only`;
}

/** Why a module whose wheels install on `platforms` brings nothing on this machine, as "Web page is built for Linux (x86-64) only, so it brings no node on this computer." */
export function whyTheModuleBringsNothingOnThisMachine(title: string, platforms: readonly PackageCatalogMachine[]): string {
  return `${title} is built for ${catalogMachinesInWords(platforms)} only, so it brings no node on this computer.`;
}
