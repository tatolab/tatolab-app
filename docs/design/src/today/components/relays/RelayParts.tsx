// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import {
  Check,
  ChevronRight,
  Copy,
  FileUp,
  KeyRound,
  LoaderCircle,
  SquareX,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/stream/primitives";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { RelayConnectionState } from "../../data";

const rejoinAttemptMs = 1500;

/** Seconds until the runtime's next rejoin of a lost relay, 0 while it is rejoining; every caller shares one clock. */
export function useRejoinCountdown(ms: number | undefined) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (ms === undefined) return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [ms]);
  if (ms === undefined) return 0;
  const phase = now % (ms + rejoinAttemptMs);
  return phase < ms ? Math.ceil((ms - phase) / 1000) : 0;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      className={cn("size-3.5 shrink-0 animate-spin text-fg-3", className)}
      strokeWidth={1.75}
    />
  );
}

/** `connection_state` as a word; a problem adds a non-round icon. */
export function RelayConnectionLabel({
  connection,
  className,
}: {
  connection: RelayConnectionState;
  className?: string;
}) {
  const left = useRejoinCountdown(
    connection.state === "lost" ? connection.rejoiningAfterMs : undefined,
  );
  if (connection.state === "joined")
    return <span className={cn("text-fg-2", className)}>Joined</span>;
  if (connection.state === "joining")
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 text-fg-2", className)}
      >
        <Spinner /> Joining…
      </span>
    );
  if (connection.state === "not_joined")
    return connection.why ? (
      <span
        className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      >
        <SquareX className="size-3.5 shrink-0 text-danger" strokeWidth={1.75} />
        <span className="truncate">
          <span className="text-danger">Not joined</span>
          <span className="text-fg-3"> — {connection.why}</span>
        </span>
      </span>
    ) : (
      <span className={cn("text-fg-3", className)}>Not joined</span>
    );
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <TriangleAlert
        className="size-3.5 shrink-0 text-warn"
        strokeWidth={1.75}
      />
      <span className="truncate">
        <span className="text-warn">Lost</span>
        <span className="text-fg-3">
          {" "}
          — {connection.why} ·{" "}
          {left > 0 ? `retrying in ${left} s` : "rejoining…"}
        </span>
      </span>
    </span>
  );
}

/** A collapsible "From the terminal" block with the equivalent CLI and an optional file body. */
export function TerminalEquivalent({
  command,
  file,
  defaultOpen,
}: {
  command: string;
  file?: { name: string; body: string };
  defaultOpen?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(
      file ? `${command}\n\n# ${file.name}\n${file.body}` : command,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="group/term flex h-7 items-center gap-1 text-fg-3 hover:text-fg-2">
        <ChevronRight
          className="size-3.5 transition-transform group-data-[panel-open]/term:rotate-90"
          strokeWidth={1.75}
        />
        From the terminal
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 overflow-hidden rounded-md border bg-well">
          <div className="flex items-start gap-2 py-1.5 pr-1 pl-3">
            <code className="min-w-0 flex-1 py-1 font-mono text-xs leading-[18px] break-all text-fg">
              <span className="text-fg-3 select-none">$ </span>
              {command}
            </code>
            <IconButton
              icon={copied ? Check : Copy}
              label={copied ? "Copied" : "Copy"}
              onClick={copy}
              className="size-6"
            />
          </div>
          {file && (
            <div className="border-t">
              <div className="px-3 pt-2 font-mono text-[11px] text-fg-3">
                {file.name}
              </div>
              <pre className="scrollbar-thin overflow-x-auto px-3 pt-1 pb-2.5 font-mono text-xs leading-[18px] text-fg-2">
                {file.body}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function KeychainNote({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-fg-3",
        className,
      )}
    >
      <KeyRound className="size-3.5 shrink-0" strokeWidth={1.75} />
      Stored in the macOS keychain, never shown again
    </span>
  );
}

export const inputClass =
  "h-7 w-full min-w-0 rounded-md border bg-window px-2.5 text-[13px] outline-none placeholder:text-fg-4 focus:border-brand disabled:opacity-60 aria-invalid:border-danger";

/** A password input for a secret setting, with a file picker the way `--from-file` reads one. */
export function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  invalid,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const pick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.jwk,.txt";
    input.onchange = () =>
      void input.files?.[0]?.text().then((t) => onChange(t.trim()));
    input.click();
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        id={id}
        type="password"
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "font-mono text-xs placeholder:font-mono")}
      />
      <IconButton
        icon={FileUp}
        label="Read from a file"
        onClick={disabled ? undefined : pick}
      />
    </div>
  );
}

/** Why a relay is lost or not joined, the runtime's own retry, and a way to rejoin now. */
export function RelayProblemDetail({
  connection,
  relayName,
  onRetryNow,
  className,
}: {
  connection: RelayConnectionState;
  relayName: string;
  onRetryNow: () => void;
  className?: string;
}) {
  const left = useRejoinCountdown(
    connection.state === "lost" ? connection.rejoiningAfterMs : undefined,
  );
  if (
    connection.state !== "lost" &&
    !(connection.state === "not_joined" && connection.why)
  )
    return null;
  const lost = connection.state === "lost";
  const Icon = lost ? TriangleAlert : SquareX;
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Icon
        className={cn("size-3.5 shrink-0", lost ? "text-warn" : "text-danger")}
        strokeWidth={1.75}
      />
      <div className="min-w-0 flex-1 text-fg-2">
        {lost ? (
          <>
            Lost the session with {relayName}:{" "}
            <span className="font-mono text-xs">{connection.why}</span>. The
            runtime rejoins on its own —{" "}
            {left > 0 ? (
              <span className="tabular">next try in {left} s.</span>
            ) : (
              <span className="inline-flex items-center gap-1 align-[-2px]">
                <Spinner className="size-3" /> rejoining now.
              </span>
            )}
          </>
        ) : (
          <>
            Not joined:{" "}
            <span className="font-mono text-xs">
              {connection.state === "not_joined" ? connection.why : ""}
            </span>
            . Public outputs are not reaching it.
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onRetryNow}
        className="h-6 shrink-0 rounded-md border bg-raised px-2 text-xs text-fg hover:bg-hover"
      >
        Retry now
      </button>
    </div>
  );
}
