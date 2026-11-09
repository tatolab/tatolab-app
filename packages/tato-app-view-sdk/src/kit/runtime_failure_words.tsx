import type { ControlDataAttributes } from "./support/control_data_attributes";
import { CopyIconButton } from "./copy_icon_button";

/** Why the runtime says something failed, whole and in its own words, wrapped in a well that scrolls when it is long, with a button that copies it. */
export function RuntimeFailureWords({ words, ...controlDataAttributes }: { words: string } & ControlDataAttributes) {
  return (
    <div className="relative w-full rounded-md bg-well text-left" {...controlDataAttributes}>
      <pre className="max-h-48 overflow-y-auto py-2.5 pr-9 pl-3 font-mono text-xs leading-[18px] break-words whitespace-pre-wrap text-danger-text select-text">{words}</pre>
      <div className="absolute top-1 right-1">
        <CopyIconButton label="Copy why it failed" readTextToCopy={() => words} size="compact" />
      </div>
    </div>
  );
}
