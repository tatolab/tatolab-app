// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { SquareX } from "lucide-react";
import { useEffect, useState } from "react";
import { RelayLogo } from "@/components/relays/RelayLogo";
import { KeyValue } from "@/components/stream/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  adapterByKind,
  type RelayAdapter,
  type RelayInstance,
} from "../../data";
import {
  inputClass,
  KeychainNote,
  SecretInput,
  Spinner,
  TerminalEquivalent,
} from "./RelayParts";
import { carriedBy, nextRelayId, settingsFileJson } from "./relayModel";

export type AddRelayState = "editing" | "joining" | "refused" | "joined";

const sampleValues: Record<"cloudflare" | "moqpro", Record<string, string>> = {
  cloudflare: {
    relay_url:
      "https://draft-16.cloudflare.mediaoverquic.com/AbCdEf0123456789abcdef",
  },
  moqpro: {
    project_id: "pb1studio",
    signing_key:
      '{"kty":"OKP","crv":"Ed25519","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo","d":"nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A"}',
    relay_url: "",
  },
};

const refusals: Record<
  "cloudflare" | "moqpro",
  { field: string; message: string }
> = {
  cloudflare: {
    field: "relay_url",
    message: "Cloudflare refused the URL: 401 — check the token in the URL.",
  },
  moqpro: {
    field: "signing_key",
    message:
      "moq.pro refused the token minted from this key: 403 — check the project ID and the signing key.",
  },
};

export function AddRelayDialog({
  adapterKind,
  state,
  relays,
  onStateChange,
  onClose,
  onAdded,
}: {
  adapterKind: "cloudflare" | "moqpro" | null;
  state: AddRelayState;
  relays: RelayInstance[];
  onStateChange: (state: AddRelayState) => void;
  onClose: () => void;
  onAdded: (relay: RelayInstance) => void;
}) {
  return (
    <Dialog open={!!adapterKind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        initialFocus={false}
        className="gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        {adapterKind && (
          <AddRelayForm
            key={adapterKind}
            adapter={adapterByKind(adapterKind)}
            kind={adapterKind}
            state={state}
            relays={relays}
            onStateChange={onStateChange}
            onClose={onClose}
            onAdded={onAdded}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddRelayForm({
  adapter,
  kind,
  state,
  relays,
  onStateChange,
  onClose,
  onAdded,
}: {
  adapter: RelayAdapter;
  kind: "cloudflare" | "moqpro";
  state: AddRelayState;
  relays: RelayInstance[];
  onStateChange: (state: AddRelayState) => void;
  onClose: () => void;
  onAdded: (relay: RelayInstance) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    state === "editing"
      ? Object.fromEntries(adapter.settings.map((s) => [s.name, ""]))
      : { ...sampleValues[kind] },
  );
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const relayId = nextRelayId(kind, relays);
  const refusal = refusals[kind];
  const busy = state === "joining";

  useEffect(() => {
    if (state !== "joining" || !submitted) return;
    const id = window.setTimeout(() => onStateChange("joined"), 1600);
    return () => window.clearTimeout(id);
  }, [state, submitted, onStateChange]);

  const set = (name: string, v: string) => {
    setValues((prev) => ({ ...prev, [name]: v }));
    setMissing((m) => {
      const next = new Set(m);
      next.delete(name);
      return next;
    });
  };

  const submit = () => {
    const empty = adapter.settings
      .filter((s) => s.required && !values[s.name]?.trim())
      .map((s) => s.name);
    if (empty.length) {
      setMissing(new Set(empty));
      return;
    }
    setSubmitted(true);
    onStateChange("joining");
  };

  const added = (): RelayInstance => ({
    relayId,
    adapter: kind,
    builtIn: false,
    settings: Object.fromEntries(
      adapter.settings
        .filter((s) => !s.secret)
        .map((s) => [s.name, values[s.name]?.trim() || null]),
    ),
    secrets: Object.fromEntries(
      adapter.settings
        .filter((s) => s.secret)
        .map((s) => [s.name, "set" as const]),
    ),
    connection: { state: "joined" },
    serves: adapter.serves,
    tracks: 0,
  });

  if (state === "joined") {
    const relay = added();
    const { publicCount } = carriedBy(relay);
    return (
      <>
        <Header adapter={adapter} title={`Added ${adapter.name}`} />
        <div className="flex flex-col gap-4 px-5 py-5">
          <p className="text-fg">
            Added as <span className="font-mono text-[12px]">{relayId}</span> ·
            Joined
          </p>
          <KeyValue
            rows={[
              ["Adapter", adapter.name],
              ...adapter.settings
                .filter((s) => s.secret)
                .map((s): [React.ReactNode, React.ReactNode] => [
                  s.label,
                  <span className="text-fg-2">
                    <span className="font-mono text-xs">{s.name}</span> · set,
                    in the keychain
                  </span>,
                ]),
              [
                "Carries",
                `${publicCount} public ${publicCount === 1 ? "output" : "outputs"}`,
              ],
            ]}
          />
          <p className="text-xs text-fg-3">
            Recorded in relays.json and rejoined at every start.
          </p>
        </div>
        <div className="flex items-center gap-2 border-t bg-chrome px-5 py-3">
          <Button
            size="sm"
            className="ml-auto h-7 px-2.5 text-[13px]"
            onClick={() => {
              onAdded(relay);
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        adapter={adapter}
        title={`Add a ${adapter.name} relay`}
        description={adapter.description}
      />
      <form
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-4 px-5 py-4">
          {adapter.settings.map((s, i) => {
            const invalid =
              missing.has(s.name) ||
              (state === "refused" && refusal.field === s.name);
            return (
              <div key={s.name} className="flex flex-col gap-1.5">
                <label
                  htmlFor={`relay-${s.name}`}
                  className="flex items-baseline gap-2"
                >
                  <span className="text-fg">{s.label}</span>
                  <span className="font-mono text-[11px] text-fg-3">
                    {s.name}
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-xs",
                      missing.has(s.name) ? "text-danger" : "text-fg-3",
                    )}
                  >
                    {s.required ? "Required" : "Optional"}
                  </span>
                </label>
                {s.secret ? (
                  <SecretInput
                    id={`relay-${s.name}`}
                    value={values[s.name] ?? ""}
                    onChange={(v) => set(s.name, v)}
                    placeholder={s.placeholder}
                    disabled={busy}
                    invalid={invalid}
                    autoFocus={i === 0}
                  />
                ) : (
                  <input
                    id={`relay-${s.name}`}
                    value={values[s.name] ?? ""}
                    disabled={busy}
                    autoFocus={i === 0}
                    aria-invalid={invalid || undefined}
                    spellCheck={false}
                    placeholder={
                      s.defaultValue
                        ? `${s.defaultValue} (default)`
                        : s.placeholder
                    }
                    onChange={(e) => set(s.name, e.target.value)}
                    className={cn(
                      inputClass,
                      s.name !== "project_id" && "font-mono text-xs",
                    )}
                  />
                )}
                <p className="text-xs text-fg-3">
                  {s.description.replace(
                    / Kept in the OS secret store and never shown again\.$/,
                    "",
                  )}
                </p>
                {s.secret && <KeychainNote />}
              </div>
            );
          })}

          {state === "refused" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 px-3 py-2.5"
            >
              <SquareX
                className="mt-px size-3.5 shrink-0 text-danger"
                strokeWidth={1.75}
              />
              <div className="min-w-0">
                <div className="text-fg">{refusal.message}</div>
                <div className="text-xs text-fg-3">
                  Nothing was recorded. Fix the setting and add again.
                </div>
              </div>
            </div>
          )}

          <TerminalEquivalent
            command={`tatolab relay add ${kind} --settings-file relay.json`}
            file={{
              name: "relay.json",
              body: settingsFileJson(adapter, values),
            }}
          />
        </div>

        <div className="flex items-center gap-2 border-t bg-chrome px-5 py-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-fg-3">
            {busy ? (
              <>
                <Spinner />{" "}
                <span className="text-fg-2">Joining {adapter.name}…</span>
              </>
            ) : (
              "Adding joins it. A relay that can't be joined is not added."
            )}
          </span>
          <div className="ml-auto flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-[13px]"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              className="h-7 px-2.5 text-[13px]"
            >
              Add and join
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

function Header({
  adapter,
  title,
  description,
}: {
  adapter: RelayAdapter;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b px-5 pt-4 pb-3.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-chrome">
        <RelayLogo provider={adapter.kind} />
      </span>
      <div className="min-w-0 pr-6">
        <DialogTitle className="text-[15px] leading-5 font-semibold">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="mt-0.5 text-[13px] text-fg-3">
            {description}
          </DialogDescription>
        )}
      </div>
    </div>
  );
}
