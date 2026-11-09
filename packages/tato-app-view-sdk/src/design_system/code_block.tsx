import type { ControlDataAttributes } from "./support/control_data_attributes";
import { CopyIconButton } from "./copy_icon_button";

/** A command to run in a terminal, on one line after a quiet prompt, with a button that copies it. */
export function CommandLine({ command, ...controlDataAttributes }: { command: string } & ControlDataAttributes) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-md bg-well pr-1 pl-3 font-mono text-xs" {...controlDataAttributes}>
      <span className="text-fg-3 select-none" aria-hidden>
        $
      </span>
      <code className="min-w-0 flex-1 truncate text-fg select-text">{command}</code>
      <CopyIconButton label={`Copy ${command}`} readTextToCopy={() => command} size="compact" />
    </div>
  );
}

/** A file's text as it is to be written, under the file's name, with a button that copies it. */
export function CodeBlock({ fileName, code, ...controlDataAttributes }: { fileName: string; code: string } & ControlDataAttributes) {
  return (
    <figure className="overflow-hidden rounded-md bg-well" {...controlDataAttributes}>
      <figcaption className="flex h-8 items-center justify-between border-b pr-1 pl-3 font-mono text-xs text-fg-3">
        {fileName}
        <CopyIconButton label={`Copy ${fileName}`} readTextToCopy={() => code} size="compact" />
      </figcaption>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-xs leading-[18px] text-fg select-text">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
