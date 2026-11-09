// Adding one requirement to a `pyproject.toml`'s `[project] dependencies` as a person would: the
// text edited in place around the array, so its comments, order and layout stay as they were.

import { parse as parseToml } from "smol-toml";
import { describeCaughtFailure, failedWith, succeeded, type Result } from "./result.js";
import { isAJsonObject } from "./json_on_the_wire.js";
import { requirementsPackageName } from "./project_on_disk.js";

/** The `[project] dependencies` `descriptionText` parses to, or why it does not parse to a list of requirements. */
function dependenciesIn(descriptionText: string): Result<string[], string> {
  let parsed: unknown;
  try {
    parsed = parseToml(descriptionText);
  } catch (parseFailure) {
    return failedWith(`pyproject.toml is not TOML: ${describeCaughtFailure(parseFailure)}`);
  }
  const project = isAJsonObject(parsed) ? parsed["project"] : undefined;
  if (!isAJsonObject(project)) return failedWith("pyproject.toml has no [project] table.");
  const dependencies = project["dependencies"];
  if (dependencies === undefined) return succeeded([]);
  if (!Array.isArray(dependencies) || !dependencies.every((dependency) => typeof dependency === "string")) {
    return failedWith("pyproject.toml's [project] dependencies is not a list of requirements.");
  }
  return succeeded(dependencies.filter((dependency): dependency is string => typeof dependency === "string"));
}

/** Where `[project]`'s table runs in `lines`: from its header line to the line before the next table header. */
function projectTableLineRange(lines: readonly string[]): { header: number; end: number } | null {
  const header = lines.findIndex((line) => /^\s*\[project\]\s*(#.*)?$/.test(line));
  if (header === -1) return null;
  const nextTable = lines.findIndex((line, lineIndex) => lineIndex > header && /^\s*\[/.test(line));
  return { header, end: nextTable === -1 ? lines.length : nextTable };
}

/** The index of the `]` that closes the array opening at `openIndex` in `text`, past strings and comments; `null` when it never closes. */
function closingBracketIndex(text: string, openIndex: number): number | null {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index];
    if (character === "#") {
      const lineEnd = text.indexOf("\n", index);
      if (lineEnd === -1) return null;
      index = lineEnd;
    } else if (character === '"' || character === "'") {
      const isTriple = text.startsWith(character.repeat(3), index);
      const quote = isTriple ? character.repeat(3) : character;
      let searchFrom = index + quote.length;
      for (;;) {
        const quoteEnd = text.indexOf(quote, searchFrom);
        if (quoteEnd === -1) return null;
        if (character === '"' && !isTriple && text[quoteEnd - 1] === "\\") {
          searchFrom = quoteEnd + 1;
          continue;
        }
        index = quoteEnd + quote.length - 1;
        break;
      }
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

/** `dependenciesText`, the array's text from `[` to `]`, with `requirementText` added last, laid out as the items before it are. */
function dependenciesArrayWithTheRequirementAdded(dependenciesText: string, requirementText: string): string {
  const inside = dependenciesText.slice(1, -1);
  if (inside.trim() === "") return `[${requirementText}]`;
  if (!inside.includes("\n")) {
    const trimmedInside = inside.replace(/\s+$/, "");
    const separator = trimmedInside.endsWith(",") ? " " : ", ";
    return `[${trimmedInside}${separator}${requirementText}${inside.slice(trimmedInside.length)}]`;
  }
  const lastItemEnd = inside.search(/\S\s*(#[^\n]*)?\s*$/);
  const beforeLastItemEnd = inside.slice(0, lastItemEnd + 1);
  const afterLastItem = inside.slice(lastItemEnd + 1);
  const lastItemLine = beforeLastItemEnd.slice(beforeLastItemEnd.lastIndexOf("\n") + 1);
  const indent = /^\s*/.exec(lastItemLine)?.[0] ?? "    ";
  const lastItemWithItsComma = beforeLastItemEnd.endsWith(",") ? beforeLastItemEnd : `${beforeLastItemEnd},`;
  const trailingComment = /^[ \t]*#[^\n]*/.exec(afterLastItem)?.[0] ?? "";
  return `[${lastItemWithItsComma}${trailingComment}\n${indent}${requirementText},${afterLastItem.slice(trailingComment.length)}]`;
}

/** `descriptionText`, a `pyproject.toml`, with `requirement` added last to `[project] dependencies`, the rest of the text as it was; refused in words for a project that already requires that name or a file it cannot place the requirement in. */
export function pyprojectTextWithTheRequirementAdded(descriptionText: string, requirement: string): Result<string, string> {
  const requiredName = requirementsPackageName(requirement);
  if (requiredName === null) return failedWith(`"${requirement}" names no project to import.`);
  const dependencies = dependenciesIn(descriptionText);
  if (!dependencies.ok) return dependencies;
  if (dependencies.value.some((dependency) => requirementsPackageName(dependency) === requiredName)) {
    return failedWith(`The project already imports ${requiredName}.`);
  }
  const requirementText = JSON.stringify(requirement);
  const lineBreak = descriptionText.includes("\r\n") ? "\r\n" : "\n";
  const lines = descriptionText.split(/\r?\n/);
  const projectTable = projectTableLineRange(lines);
  if (projectTable === null) return failedWith("pyproject.toml has no [project] table to add the import to.");
  const dependenciesLine = lines.findIndex((line, lineIndex) => lineIndex > projectTable.header && lineIndex < projectTable.end && /^\s*dependencies\s*=/.test(line));
  let editedText: string;
  if (dependenciesLine === -1) {
    const editedLines = [...lines];
    editedLines.splice(projectTable.header + 1, 0, `dependencies = [${requirementText}]`);
    editedText = editedLines.join(lineBreak);
  } else {
    const normalizedText = lines.join("\n");
    const dependenciesLineStart = lines.slice(0, dependenciesLine).reduce((length, line) => length + line.length + 1, 0);
    const openIndex = normalizedText.indexOf("[", dependenciesLineStart);
    const closeIndex = openIndex === -1 ? null : closingBracketIndex(normalizedText, openIndex);
    if (closeIndex === null) return failedWith("pyproject.toml's [project] dependencies does not close; nothing was added.");
    const arrayText = normalizedText.slice(openIndex, closeIndex + 1);
    editedText = `${normalizedText.slice(0, openIndex)}${dependenciesArrayWithTheRequirementAdded(arrayText, requirementText)}${normalizedText.slice(closeIndex + 1)}`.split("\n").join(lineBreak);
  }
  const dependenciesAfter = dependenciesIn(editedText);
  if (!dependenciesAfter.ok || dependenciesAfter.value.at(-1) !== requirement || dependenciesAfter.value.length !== dependencies.value.length + 1) {
    return failedWith("The import could not be placed in pyproject.toml's [project] dependencies without changing its other entries; add it by hand.");
  }
  return succeeded(editedText);
}
