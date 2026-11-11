import { TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { ActionButton } from "./action_button";
import type { ControlDataAttributes } from "./support/control_data_attributes";

/** The words of a notice the person reads and acknowledges: its title, what it says, and the word of its one button. */
export interface NoticeWords {
  title: string;
  explanation: string;
  acknowledgeWords: string;
}

/** Tells the person something they need to know before they go on, with the warning's amber triangle beside its title and one button that acknowledges it, as closing it does. */
export function NoticeDialog({
  isOpen,
  onAcknowledged,
  onClosedCompletely,
  notice,
  ...controlDataAttributes
}: {
  isOpen: boolean;
  onAcknowledged: () => void;
  /** Once it has finished closing, so its words stay through the closing animation. */
  onClosedCompletely?: () => void;
  /** `null` while there is nothing to say. */
  notice: NoticeWords | null;
} & ControlDataAttributes) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(isOpenNow) => {
        if (!isOpenNow) onAcknowledged();
      }}
      onOpenChangeComplete={(hasOpened) => {
        if (!hasOpened) onClosedCompletely?.();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md" {...controlDataAttributes}>
        {notice !== null && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg leading-5 font-semibold">
                <TriangleAlert className="size-4.5 shrink-0 text-warn-text" strokeWidth={1.75} aria-hidden />
                {notice.title}
              </DialogTitle>
              <DialogDescription className="text-sm text-fg-2">{notice.explanation}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="mx-0 mb-0 rounded-none border-t-0 bg-transparent p-0">
              <ActionButton appearance="primary" hasFocusOnOpen onPressed={onAcknowledged}>
                {notice.acknowledgeWords}
              </ActionButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
