import type { ListedStream } from "../../shared/tatolab_backend_contract";

/** The id of the stream to select: the one chosen if still listed, else the nearest one after it, else the first. */
export function chooseSelectedStreamId(listedStreams: ListedStream[], previouslySelectedStreamId: string | null, previouslyListedStreamIds: string[]): string | null {
  if (listedStreams.length === 0) return null;
  const listedIds = new Set(listedStreams.map((listedStream) => listedStream.stream));
  if (previouslySelectedStreamId === null) return listedStreams[0].stream;
  if (listedIds.has(previouslySelectedStreamId)) return previouslySelectedStreamId;
  const previousIndex = previouslyListedStreamIds.indexOf(previouslySelectedStreamId);
  if (previousIndex >= 0) {
    const followingIds = previouslyListedStreamIds.slice(previousIndex + 1);
    const precedingIdsNearestFirst = previouslyListedStreamIds.slice(0, previousIndex).reverse();
    for (const candidateId of [...followingIds, ...precedingIdsNearestFirst]) {
      if (listedIds.has(candidateId)) return candidateId;
    }
  }
  return listedStreams[0].stream;
}
