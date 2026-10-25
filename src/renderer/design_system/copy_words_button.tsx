// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy } from "lucide-react";
import type { ActionButtonAppearance } from "./action_button";
import { ActionButton } from "./action_button";
import type { ControlDataAttributes } from "./control_data_attributes";
import { useCopiedConfirmation } from "./copied_confirmation";

/** A button that says Copy, copies what `readTextToCopy` reads when it is pressed, and says Copied for a moment once the copy is made. */
export function CopyWordsButton({
  readTextToCopy,
  appearance = "secondary",
  ...controlDataAttributes
}: {
  readTextToCopy: () => string;
  appearance?: Extract<ActionButtonAppearance, "secondary" | "quiet">;
} & ControlDataAttributes) {
  const { wasCopied, copy } = useCopiedConfirmation(readTextToCopy);
  return (
    // Wide enough for Copied, so the button keeps its width as its word changes.
    <ActionButton appearance={appearance} icon={wasCopied ? Check : Copy} onPressed={copy} className="min-w-[84px]" {...controlDataAttributes}>
      {wasCopied ? "Copied" : "Copy"}
    </ActionButton>
  );
}
