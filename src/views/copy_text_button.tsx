// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Check, Copy } from "lucide-react";
import { useCopiedConfirmation } from "./copied_confirmation";
import { Button } from "./shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./shadcn/tooltip";

/** A small icon button that copies what `readTextToCopy` reads when it is pressed, saying Copied for a moment once the copy is made. */
export function CopyTextButton({
  readTextToCopy,
  label,
  controlAttribute,
}: {
  readTextToCopy: () => string;
  label: string;
  controlAttribute: Record<`data-${string}`, string>;
}) {
  const { wasCopied, copy } = useCopiedConfirmation(readTextToCopy);
  const ButtonIcon = wasCopied ? Check : Copy;
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={wasCopied ? "Copied" : label} onClick={copy} {...controlAttribute} />}>
        <ButtonIcon className="size-4" strokeWidth={1.75} aria-hidden />
      </TooltipTrigger>
      <TooltipContent>{wasCopied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
}
