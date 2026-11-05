import { cn } from "cn";
import { ArrowUp, Square } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { ControlDataAttributes } from "./control_data_attributes";
import { FULL_STRENGTH_FOCUS_RING_CLASS_NAMES } from "./full_strength_focus_ring";
import { IconButton } from "./icon_button";

/** Where a person writes to an agent: Enter sends and Shift+Enter starts a new line; while the agent works, the send button stops it instead. */
export function MessageComposer({
  label,
  placeholder,
  text,
  onTextChanged,
  onSendAsked,
  sendDisabledReason = null,
  isTheAgentWorking = false,
  onStopAsked,
  ...controlDataAttributes
}: {
  /** The field's accessible name, as "Message Claude Code". */
  label: string;
  placeholder: string;
  text: string;
  onTextChanged: (text: string) => void;
  onSendAsked: () => void;
  /** Why nothing can be sent now, as while the agent starts. */
  sendDisabledReason?: string | null;
  isTheAgentWorking?: boolean;
  onStopAsked: () => void;
} & ControlDataAttributes) {
  const nothingToSend = text.trim() === "" ? "Write a message first" : null;
  return (
    <div className="flex shrink-0 items-end gap-1 border-t border-studio-area-header-line bg-studio-area p-2" {...controlDataAttributes}>
      <Textarea
        value={text}
        onChange={(changeEvent) => onTextChanged(changeEvent.target.value)}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key !== "Enter" || keyEvent.shiftKey || keyEvent.nativeEvent.isComposing) return;
          keyEvent.preventDefault();
          if (sendDisabledReason === null && !isTheAgentWorking && nothingToSend === null) onSendAsked();
        }}
        placeholder={placeholder}
        aria-label={label}
        spellCheck
        autoComplete="off"
        rows={1}
        className={cn("max-h-32 min-h-8 resize-none rounded-md border-line bg-window px-2.5 py-1.5 text-studio text-fg dark:bg-window", FULL_STRENGTH_FOCUS_RING_CLASS_NAMES)}
        data-message-composer-text=""
      />
      {isTheAgentWorking ? (
        <IconButton icon={Square} isIconFilled label="Stop the agent" onPressed={onStopAsked} data-message-composer-action="stop" />
      ) : (
        <IconButton icon={ArrowUp} label="Send" disabledReason={sendDisabledReason ?? nothingToSend} onPressed={onSendAsked} data-message-composer-action="send" />
      )}
    </div>
  );
}
