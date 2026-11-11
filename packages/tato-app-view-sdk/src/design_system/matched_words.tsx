/** Where `searchWords` first sits in `words`, ignoring case and the search's surrounding spaces; `null` when it doesn't, or the search is blank. */
export function whereTheSearchMatches(words: string, searchWords: string): { start: number; end: number } | null {
  const needle = searchWords.trim().toLowerCase();
  if (needle === "") return null;
  const start = words.toLowerCase().indexOf(needle);
  return start === -1 ? null : { start, end: start + needle.length };
}

/** `words` with the part that matches `searchWords` marked in the brand's text colour, as a search field's matches read. */
export function MatchedWords({ words, searchWords }: { words: string; searchWords: string }) {
  const match = whereTheSearchMatches(words, searchWords);
  if (match === null) return words;
  return (
    <>
      {words.slice(0, match.start)}
      <mark className="bg-transparent font-semibold text-brand-text" data-matched-words="">
        {words.slice(match.start, match.end)}
      </mark>
      {words.slice(match.end)}
    </>
  );
}
