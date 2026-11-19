import { whereTheSearchMatches } from "@tatolab/tato-app-view-sdk/design_system/matched_words";
import { nameInWords } from "../shared/node_words";

/** Which of a node's properties a search keeps, and how many of them that is. */
export interface PropertiesMatchingTheSearch {
  is_searching: boolean;
  inputs_listed: ReadonlySet<string>;
  outputs_listed: ReadonlySet<string>;
  listed_count: number;
  property_count: number;
}

/**
 * The properties a search for `searchWords` keeps of a node with inputs `inputs`, its settings among them, and outputs
 * `outputs`: one whose name, as written or in words, matches, ignoring case; every property for a blank search.
 */
export function propertiesMatchingTheSearch(inputs: readonly string[], outputs: readonly string[], searchWords: string): PropertiesMatchingTheSearch {
  const isSearching = searchWords.trim() !== "";
  const matches = (name: string) => !isSearching || [name, nameInWords(name)].some((candidate) => whereTheSearchMatches(candidate, searchWords) !== null);
  const inputsListed = new Set(inputs.filter(matches));
  const outputsListed = new Set(outputs.filter(matches));
  return {
    is_searching: isSearching,
    inputs_listed: inputsListed,
    outputs_listed: outputsListed,
    listed_count: inputsListed.size + outputsListed.size,
    property_count: inputs.length + outputs.length,
  };
}

/** How many of the node's properties a search lists, as "1 of 9 properties". */
export function propertiesListedWords({ listed_count, property_count }: PropertiesMatchingTheSearch): string {
  return `${listed_count} of ${property_count} ${property_count === 1 ? "property" : "properties"}`;
}
