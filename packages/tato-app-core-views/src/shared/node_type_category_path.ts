// The groups a node type is filed under, as the Add node search and the Library both list them: the
// `category` the runtime serves read as a path, and the one entry for a node type served with none.

/** What the entry of the node types the runtime serves with no category is called. */
export const NODE_TYPES_SERVED_WITH_NO_CATEGORY_WORDS = "Ungrouped";

/** The groups a served `category` files a node type under, outermost first: `Effects/Stylize` is Stylize inside Effects; none for a node type served with no category. */
export function nodeTypeCategoryPath(category: string | null): string[] {
  return (category ?? "")
    .split("/")
    .map((group) => group.trim())
    .filter((group) => group !== "");
}
