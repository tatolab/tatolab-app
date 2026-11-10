// What the Stream graph's header says about the open project's history: that it is saved, and who made the
// latest edit, "you" when the person editing in Studio made it.

import type { ProjectTransaction, ProjectTransactionAuthor } from "@tatolab/tato-app-view-sdk/studio_readings";
import { whoMadeTheEdit } from "../history/history_rows_of_the_feed";

/** The header's words for the feed's newest applied edit, as "Saved · last edit by you"; `null` while the project has no edit. */
export function streamGraphSavedWords(transactionsNewestFirst: readonly ProjectTransaction[], thePersonEditing: ProjectTransactionAuthor | null): string | null {
  const latestEdit = transactionsNewestFirst.find((transaction) => transaction.undoes === null);
  if (latestEdit === undefined) return null;
  const madeByThePersonEditing = thePersonEditing !== null && latestEdit.author_kind === thePersonEditing.kind && latestEdit.author_name === thePersonEditing.name;
  return `Saved · last edit by ${madeByThePersonEditing ? "you" : whoMadeTheEdit(latestEdit.author_kind, latestEdit.author_name)}`;
}
