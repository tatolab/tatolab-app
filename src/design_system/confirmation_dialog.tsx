// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionButton } from "./action_button";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";

/** The words of a question asked before an action: the question, what answering it does, and the word of the button that answers yes. */
export interface ConfirmationQuestion {
  title: string;
  explanation: string;
  confirmWords: string;
}

/**
 * Asks before an action that cannot be undone: the question and what it does, Cancel (which holds focus as it opens,
 * so Return never confirms by accident) and the button that does it.
 */
export function ConfirmationDialog({
  isOpen,
  onOpenChange,
  onClosedCompletely,
  question,
  isDestructive = false,
  onConfirmed,
  confirmDataAttributes = {},
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** Once it has finished closing, so its words stay through the closing animation. */
  onClosedCompletely?: () => void;
  /** `null` while there is nothing to ask. */
  question: ConfirmationQuestion | null;
  isDestructive?: boolean;
  onConfirmed: () => void;
  /** The confirm button's own `data-*` attributes. */
  confirmDataAttributes?: ControlDataAttributes;
} & ControlDataAttributes) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(hasOpened) => {
        if (!hasOpened) onClosedCompletely?.();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md" {...controlDataAttributes}>
        {question !== null && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg leading-5 font-semibold">{question.title}</DialogTitle>
              <DialogDescription className="text-sm text-fg-2">{question.explanation}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="mx-0 mb-0 rounded-none border-t-0 bg-transparent p-0">
              <DialogClose
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    autoFocus
                    className={`rounded-md border-line-strong bg-raised text-sm text-fg hover:bg-hover dark:border-line-strong dark:bg-raised dark:hover:bg-hover ${FULL_STRENGTH_FOCUS_RING_CLASS_NAMES}`}
                  />
                }
              >
                Cancel
              </DialogClose>
              <ActionButton appearance={isDestructive ? "destructive" : "primary"} onPressed={onConfirmed} {...confirmDataAttributes}>
                {question.confirmWords}
              </ActionButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
