// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { useEffect, useState } from "react";
import { writeTextToClipboard } from "../clipboard";

/** How long a copy button says Copied. */
const COPIED_WORD_MILLISECONDS = 1400;

/** Copies `textToCopy` on `copy`, and says so in `wasCopied` for a moment. */
export function useCopiedConfirmation(textToCopy: string): { wasCopied: boolean; copy: () => void } {
  const [wasCopied, setWasCopied] = useState(false);
  useEffect(() => {
    if (!wasCopied) return;
    const resetTimer = window.setTimeout(() => setWasCopied(false), COPIED_WORD_MILLISECONDS);
    return () => window.clearTimeout(resetTimer);
  }, [wasCopied]);
  return { wasCopied, copy: () => void writeTextToClipboard(textToCopy).then(() => setWasCopied(true)) };
}
