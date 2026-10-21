// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { RotateCcw, SquareX } from "lucide-react";
import { useEffect, useState } from "react";
import { RelayLogo } from "@/components/relays/RelayLogo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  adapterByKind,
  type RelayInstance,
  type RelaySettingSchema,
} from "../../data";
import {
  inputClass,
  KeychainNote,
  RelayConnectionLabel,
  RelayProblemDetail,
  SecretInput,
  Spinner,
  TerminalEquivalent,
} from "./RelayParts";
import {
  builtInListenerWords,
  carriedBy,
  relayDisplayName,
  relaySetCommand,
  settingDefault,
} from "./relayModel";

export type ConfigureRelayState =
  "editing" | "joining" | "kept-previous" | "joined";

const keptPreviousWhy: Record<
  RelayInstance["adapter"],
  (relay: RelayInstance) => string
> = {
  local: (r) =>
    `The listener could not take port 5443: address already in use. It kept port ${r.settings.port ?? settingDefault(r, "port")}.`,
  cloudflare: () =>
    "Cloudflare refused the new URL: 401. It kept the URL it had.",
  moqpro: () =>
    "moq.pro refused the token minted from the new signing key: 403. It kept the key and settings it had.",
};

export function ConfigureRelaySheet({
  relay,
  state,
  onStateChange,
  onClose,
  onRetryNow,
  onRemove,
}: {
  relay: RelayInstance | undefined;
  state: ConfigureRelayState;
  onStateChange: (state: ConfigureRelayState) => void;
  onClose: () => void;
  onRetryNow: (relayId: string) => void;
  onRemove: (relayId: string) => void;
}) {
  return (
    <Sheet open={!!relay} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        initialFocus={false}
        className="gap-0 bg-chrome p-0 data-[side=right]:w-[460px] data-[side=right]:sm:max-w-[460px]"
      >
        {relay && (
          <RelayEditor
            key={relay.relayId}
            relay={relay}
            state={state}
            onStateChange={onStateChange}
            onClose={onClose}
            onRetryNow={() => onRetryNow(relay.relayId)}
            onRemove={() => onRemove(relay.relayId)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b px-5 py-4 last:border-b-0">
      <div className="mb-3">
        <div className="font-medium">{title}</div>
        {hint && <p className="text-xs text-fg-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({
  setting,
  htmlFor,
  aside,
}: {
  setting: RelaySettingSchema;
  htmlFor?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex h-6 items-center gap-2">
      <label htmlFor={htmlFor} className="text-fg">
        {setting.label}
      </label>
      <span className="font-mono text-[11px] text-fg-3">{setting.name}</span>
      <span className="ml-auto flex items-center gap-2">{aside}</span>
    </div>
  );
}

function RelayEditor({
  relay,
  state,
  onStateChange,
  onClose,
  onRetryNow,
  onRemove,
}: {
  relay: RelayInstance;
  state: ConfigureRelayState;
  onStateChange: (state: ConfigureRelayState) => void;
  onClose: () => void;
  onRetryNow: () => void;
  onRemove: () => void;
}) {
  const adapter = adapterByKind(relay.adapter);
  const name = relayDisplayName(relay);
  const listener = builtInListenerWords[relay.relayId];
  const plain = adapter.settings.filter((s) => !s.secret);
  const secrets = adapter.settings.filter((s) => s.secret);
  const initial: Record<string, string> = Object.fromEntries(
    plain.map((s) => {
      const v = relay.settings[s.name];
      return [
        s.name,
        v == null || String(v) === settingDefault(relay, s.name)
          ? ""
          : String(v),
      ];
    }),
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [replacing, setReplacing] = useState<
    Record<string, string | undefined>
  >({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const busy = state === "joining";

  useEffect(() => {
    if (state !== "joining" || !submitted) return;
    const id = window.setTimeout(() => onStateChange("joined"), 1600);
    return () => window.clearTimeout(id);
  }, [state, submitted, onStateChange]);

  const changed: Record<string, string | null> = {};
  for (const s of plain) {
    const now = values[s.name].trim();
    if (now !== initial[s.name]) changed[s.name] = now === "" ? null : now;
  }
  const replacedSecrets = Object.entries(replacing)
    .filter(([, v]) => v !== undefined && v.trim() !== "")
    .map(([k]) => k);
  const dirty = Object.keys(changed).length > 0 || replacedSecrets.length > 0;

  const save = () => {
    setSubmitted(true);
    onStateChange("joining");
  };

  const { publicCount, privateCount } = carriedBy(relay);
  const connection =
    state === "joining"
      ? ({ state: "joining" } as const)
      : state === "joined"
        ? ({ state: "joined" } as const)
        : relay.connection;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-5 pt-4 pb-4">
        <div className="flex items-start gap-3 pr-8">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-raised">
            <RelayLogo provider={relay.adapter} />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-[15px] leading-5 font-semibold">
              {name}
            </SheetTitle>
            <SheetDescription className="truncate font-mono text-xs text-fg-3">
              {relay.relayId}
            </SheetDescription>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          <span className="w-16 shrink-0 text-fg-3">Status</span>
          <RelayConnectionLabel connection={connection} className="min-w-0" />
        </div>
        <div className="mt-1 flex items-center gap-2 text-[13px]">
          <span className="w-16 shrink-0 text-fg-3">Carries</span>
          <span className="text-fg-2">
            {publicCount} public {publicCount === 1 ? "output" : "outputs"}
            {privateCount > 0 && ` · ${privateCount} private`}
          </span>
        </div>
        {listener && (
          <div className="mt-1 flex items-center gap-2 text-[13px]">
            <span className="w-16 shrink-0 text-fg-3">Reaches</span>
            <span className="text-fg-2">{listener.reaches}</span>
          </div>
        )}
        {state === "editing" && (
          <RelayProblemDetail
            connection={relay.connection}
            relayName={name}
            onRetryNow={onRetryNow}
            className="mt-3 rounded-md border bg-window px-3 py-2.5"
          />
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {plain.length > 0 && (
          <Section
            title="Settings"
            hint={
              listener
                ? "Built in and run by the runtime. Only the port can change."
                : "Saving replaces only what you change, then rejoins."
            }
          >
            <div className="flex flex-col gap-4">
              {plain.map((s) => {
                const fallback = settingDefault(relay, s.name);
                const optional = !s.required;
                const value = values[s.name];
                return (
                  <div key={s.name} className="flex flex-col gap-1.5">
                    <FieldLabel
                      setting={s}
                      htmlFor={`configure-${s.name}`}
                      aside={
                        optional && fallback && value !== "" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setValues((v) => ({ ...v, [s.name]: "" }))
                            }
                            className="inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg"
                          >
                            <RotateCcw className="size-3" strokeWidth={1.75} />{" "}
                            Use default
                          </button>
                        ) : optional && fallback ? (
                          <span className="text-xs text-fg-3">Default</span>
                        ) : null
                      }
                    />
                    <input
                      id={`configure-${s.name}`}
                      value={value}
                      disabled={busy}
                      inputMode={s.kind === "port" ? "numeric" : undefined}
                      spellCheck={false}
                      placeholder={
                        fallback ? `${fallback} (default)` : s.placeholder
                      }
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [s.name]: e.target.value }))
                      }
                      className={cn(
                        inputClass,
                        s.name !== "project_id" && "font-mono text-xs",
                        s.kind === "port" && "w-32 tabular",
                      )}
                    />
                    <p className="text-xs text-fg-3">{s.description}</p>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {secrets.length > 0 && (
          <Section
            title="Secrets"
            hint="Kept in the macOS keychain. The runtime reports only whether each is set."
          >
            <div className="flex flex-col gap-4">
              {secrets.map((s) => {
                const replacement = replacing[s.name];
                return (
                  <div key={s.name} className="flex flex-col gap-1.5">
                    <FieldLabel
                      setting={s}
                      htmlFor={`configure-${s.name}`}
                      aside={
                        replacement === undefined ? (
                          <>
                            <span className="text-xs text-fg-2">
                              {relay.secrets[s.name] === "set"
                                ? "Set"
                                : "Not set"}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                setReplacing((r) => ({ ...r, [s.name]: "" }))
                              }
                            >
                              Replace…
                            </Button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-fg-3 hover:text-fg"
                            onClick={() =>
                              setReplacing((r) => ({
                                ...r,
                                [s.name]: undefined,
                              }))
                            }
                          >
                            Keep current
                          </button>
                        )
                      }
                    />
                    {replacement !== undefined && (
                      <>
                        <SecretInput
                          id={`configure-${s.name}`}
                          value={replacement}
                          autoFocus
                          disabled={busy}
                          placeholder={s.placeholder}
                          onChange={(v) =>
                            setReplacing((r) => ({ ...r, [s.name]: v }))
                          }
                        />
                        <KeychainNote />
                      </>
                    )}
                    <p className="text-xs text-fg-3">
                      {relay.adapter === "cloudflare"
                        ? "To change the token, mint a new URL in Cloudflare and replace it here. Minting one needs your Cloudflare account API token, which the runtime never holds."
                        : s.description.replace(
                            / Kept in the OS secret store and never shown again\.$/,
                            "",
                          )}
                    </p>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <div className="border-b px-5 py-3">
          <TerminalEquivalent
            command={
              dirty
                ? relaySetCommand(relay.relayId, changed, replacedSecrets)
                : [
                    `tatolab relay set ${relay.relayId}`,
                    ...plain.map((p) => `${p.name}=…`),
                    ...secrets.map((p) => `--secret ${p.name} --from-stdin`),
                  ].join(" ")
            }
          />
        </div>

        {!relay.builtIn && (
          <Section
            title="Remove relay"
            hint="Leaves the relay and forgets it and its secrets. Public outputs stop reaching it."
          >
            {confirmRemove ? (
              <div className="flex flex-col gap-3 rounded-md border border-danger/30 bg-window px-3 py-3">
                <p className="text-fg">
                  Remove{" "}
                  <span className="font-mono text-xs">{relay.relayId}</span>?
                  Its {secrets.map((s) => s.name).join(" and ")} will be deleted
                  from the keychain. Adding it again means pasting{" "}
                  {secrets.length === 1 ? "it" : "them"} again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-3">
                    tatolab relay rm {relay.relayId}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-[13px]"
                    onClick={() => setConfirmRemove(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2.5 text-[13px]"
                    onClick={onRemove}
                  >
                    Remove relay
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                className="h-7 px-2.5 text-[13px] text-danger hover:text-danger"
                onClick={() => setConfirmRemove(true)}
              >
                Remove relay…
              </Button>
            )}
          </Section>
        )}
      </div>

      {state === "kept-previous" && (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2 border-t bg-window px-5 py-3"
        >
          <SquareX
            className="mt-px size-3.5 shrink-0 text-danger"
            strokeWidth={1.75}
          />
          <div className="min-w-0">
            <div className="text-fg">
              The rejoin failed, so nothing changed.
            </div>
            <div className="text-xs text-fg-3">
              {keptPreviousWhy[relay.adapter](relay)}
            </div>
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t px-5 py-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-fg-3">
          {state === "joining" ? (
            <>
              <Spinner /> <span className="text-fg-2">Rejoining {name}…</span>
            </>
          ) : state === "joined" ? (
            <span className="text-fg-2">Saved · Joined</span>
          ) : state === "kept-previous" ? (
            "Kept the previous settings."
          ) : dirty ? (
            "Saving rejoins with the new settings."
          ) : (
            "No changes."
          )}
        </span>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[13px]"
            onClick={onClose}
          >
            {state === "joined" ? "Done" : "Cancel"}
          </Button>
          <Button
            size="sm"
            className="h-7 px-2.5 text-[13px]"
            disabled={!dirty || busy}
            onClick={save}
          >
            Save and rejoin
          </Button>
        </div>
      </div>
    </div>
  );
}
