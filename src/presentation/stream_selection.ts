// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import type { ListedStream } from "../backend/tatolab_backend_contract";

/** The stream to select: the one chosen if still listed, else the nearest one after it, else the first. */
export function chooseSelectedStreamName(
  listedStreams: ListedStream[],
  previouslySelectedStreamName: string | null,
  previouslyListedStreamNames: string[],
): string | null {
  if (listedStreams.length === 0) return null;
  const listedNames = new Set(listedStreams.map((stream) => stream.name));
  if (previouslySelectedStreamName === null) return listedStreams[0].name;
  if (listedNames.has(previouslySelectedStreamName)) return previouslySelectedStreamName;
  const previousIndex = previouslyListedStreamNames.indexOf(previouslySelectedStreamName);
  if (previousIndex >= 0) {
    const followingNames = previouslyListedStreamNames.slice(previousIndex + 1);
    const precedingNamesNearestFirst = previouslyListedStreamNames.slice(0, previousIndex).reverse();
    for (const candidateName of [...followingNames, ...precedingNamesNearestFirst]) {
      if (listedNames.has(candidateName)) return candidateName;
    }
  }
  return listedStreams[0].name;
}
