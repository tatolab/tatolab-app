import { whereTheSearchMatches } from "@tatolab/tato-app-view-sdk/design_system/matched_words";
import { nameInWords } from "../shared/node_words";

/** Which of a node's properties a search keeps, and how many of them that is. */
export interface PropertiesMatchingTheSearch {
  is_searching: boolean;
  config_keys_listed: ReadonlySet<string>;
  input_ports_listed: ReadonlySet<string>;
  output_ports_listed: ReadonlySet<string>;
  listed_count: number;
  property_count: number;
}

/**
 * The properties a search for `searchWords` keeps of a node with config keys `configKeys` and ports `inputPorts` and
 * `outputPorts`: a config field whose key or name in words matches, and a port whose name matches, ignoring case; every
 * property for a blank search.
 */
export function propertiesMatchingTheSearch(configKeys: readonly string[], inputPorts: readonly string[], outputPorts: readonly string[], searchWords: string): PropertiesMatchingTheSearch {
  const isSearching = searchWords.trim() !== "";
  const matches = (...words: string[]) => !isSearching || words.some((candidate) => whereTheSearchMatches(candidate, searchWords) !== null);
  const configKeysListed = new Set(configKeys.filter((key) => matches(key, nameInWords(key))));
  const inputPortsListed = new Set(inputPorts.filter((port) => matches(port)));
  const outputPortsListed = new Set(outputPorts.filter((port) => matches(port)));
  return {
    is_searching: isSearching,
    config_keys_listed: configKeysListed,
    input_ports_listed: inputPortsListed,
    output_ports_listed: outputPortsListed,
    listed_count: configKeysListed.size + inputPortsListed.size + outputPortsListed.size,
    property_count: configKeys.length + inputPorts.length + outputPorts.length,
  };
}

/** How many of the node's properties a search lists, as "1 of 9 properties". */
export function propertiesListedWords({ listed_count, property_count }: PropertiesMatchingTheSearch): string {
  return `${listed_count} of ${property_count} ${property_count === 1 ? "property" : "properties"}`;
}
