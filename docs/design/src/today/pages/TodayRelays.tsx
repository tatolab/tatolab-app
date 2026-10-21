// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RelayLogo } from "@/components/relays/RelayLogo";
import { IconButton, KindIcon } from "@/components/stream/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { kindWords } from "@/lib/vocab";
import {
  AddRelayDialog,
  type AddRelayState,
} from "../components/relays/AddRelayDialog";
import {
  ConfigureRelaySheet,
  type ConfigureRelayState,
} from "../components/relays/ConfigureRelaySheet";
import {
  RelayConnectionLabel,
  RelayProblemDetail,
} from "../components/relays/RelayParts";
import {
  addableAdapters,
  builtInListenerWords,
  carriedBy,
  outputsAt,
  relayDisplayName,
  settingsSummary,
} from "../components/relays/relayModel";
import {
  adapterByKind,
  type RelayConnectionState,
  type RelayInstance,
  todayRelays,
} from "../data";

const addStates: AddRelayState[] = ["editing", "joining", "refused", "joined"];
const configureStates: ConfigureRelayState[] = [
  "editing",
  "joining",
  "kept-previous",
  "joined",
];

function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end gap-3 px-5 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] leading-5 font-semibold">{title}</h2>
        <p className="text-fg-3">{hint}</p>
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

function RelayColumns() {
  return (
    <colgroup>
      <col className="w-[22%]" />
      <col />
      <col className="w-[148px]" />
      <col className="w-[136px]" />
      <col className="w-[20%]" />
      <col className="w-[124px]" />
    </colgroup>
  );
}

function RelayNameCell({ relay }: { relay: RelayInstance }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-chrome">
        <RelayLogo provider={relay.adapter} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-fg">{relayDisplayName(relay)}</div>
        <div className="truncate font-mono text-xs text-fg-3">
          {relay.relayId}
        </div>
      </div>
    </div>
  );
}

function Carries({ relay }: { relay: RelayInstance }) {
  const { publicCount, privateCount } = carriedBy(relay);
  return (
    <span className="whitespace-nowrap text-fg-2 tabular">
      {publicCount} public
      {privateCount > 0 && (
        <span className="text-fg-3"> · {privateCount} private</span>
      )}
    </span>
  );
}

function AddRelayMenu({
  onPick,
  variant = "default",
}: {
  onPick: (kind: "cloudflare" | "moqpro") => void;
  variant?: "default" | "outline";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={variant}
            size="sm"
            className="h-7 gap-1 px-2.5 text-[13px]"
          />
        }
      >
        <Plus className="size-3.5" /> Add relay{" "}
        <ChevronDown className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {addableAdapters().map((a) => (
          <DropdownMenuItem
            key={a.kind}
            onClick={() => onPick(a.kind as "cloudflare" | "moqpro")}
            className="items-start gap-2.5 px-2 py-1.5"
          >
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border bg-raised">
              <RelayLogo provider={a.kind} className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] text-fg">{a.name}</span>
              <span className="block text-xs text-fg-3">
                {a.kind === "cloudflare"
                  ? "Public ports, at the relay's top level"
                  : "Public ports, under a moq.pro project"}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <a
          href="/direction/sharing"
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs whitespace-nowrap text-fg-3 hover:bg-hover hover:text-fg-2"
        >
          More relays and relay setups are on the roadmap
          <ArrowUpRight className="size-3" strokeWidth={1.75} />
        </a>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function TodayRelays() {
  const [params, setParams] = useSearchParams();
  const [added, setAdded] = useState<RelayInstance[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<
    Record<string, RelayConnectionState>
  >({});
  const [removeAsk, setRemoveAsk] = useState<string | null>(null);

  const update = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) {
            if (v === null) p.delete(k);
            else p.set(k, v);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const relays = [...todayRelays, ...added]
    .filter((r) => !removed.has(r.relayId))
    .map((r) =>
      overrides[r.relayId] ? { ...r, connection: overrides[r.relayId] } : r,
    );
  const builtIn = relays.filter((r) => r.builtIn);
  const hosted = relays.filter((r) => !r.builtIn);

  const addParam = params.get("add");
  const addKind =
    addParam === "cloudflare" || addParam === "moqpro" ? addParam : null;
  const configuring = relays.find((r) => r.relayId === params.get("relay"));
  const stateParam = params.get("state");
  const addState = addStates.find((s) => s === stateParam) ?? "editing";
  const configureState =
    configureStates.find((s) => s === stateParam) ?? "editing";

  const retryNow = (relayId: string) => {
    setOverrides((o) => ({ ...o, [relayId]: { state: "joining" } }));
    window.setTimeout(
      () => setOverrides((o) => ({ ...o, [relayId]: { state: "joined" } })),
      1500,
    );
  };
  const remove = (relayId: string) => {
    setRemoved((s) => new Set(s).add(relayId));
    setRemoveAsk(null);
    update({ relay: null, state: null });
  };
  const askRemove = relays.find((r) => r.relayId === removeAsk);

  const publicOutputs = outputsAt("public");
  const privateLoaded = outputsAt("private").filter(
    (o) => o.stream.loaded,
  ).length;
  const joinedCount = relays.filter(
    (r) => r.connection.state === "joined",
  ).length;
  const openAdd = (kind: "cloudflare" | "moqpro") =>
    update({ add: kind, state: null, relay: null });
  const openConfigure = (relayId: string) =>
    update({ relay: relayId, state: null, add: null });

  return (
    <div className="flex min-h-full flex-col pb-10">
      <div className="flex items-center gap-3 px-5 pt-5 pb-6">
        <div className="min-w-0">
          <h1 className="title-lg">Relays</h1>
          <p className="text-fg-3">
            Public outputs are published to every relay this machine joins;
            private outputs stay on the loopback listener.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="text-fg-3 tabular">
            {joinedCount} of {relays.length} joined
          </span>
          <AddRelayMenu onPick={openAdd} />
        </div>
      </div>

      <SectionHeader
        title="Built in"
        hint="The runtime's own relay, listening twice. Always there; only the port changes."
      />
      <div className="mx-5 overflow-hidden rounded-lg border">
        <table className="w-full table-fixed border-collapse text-left">
          <RelayColumns />
          <thead>
            <tr className="border-b bg-chrome text-xs text-fg-3">
              <th className="h-8 pr-3 pl-4 font-normal">Listener</th>
              <th className="px-3 font-normal">Reaches</th>
              <th className="px-3 font-normal">Port</th>
              <th className="px-3 font-normal">Carries</th>
              <th className="px-3 font-normal">Status</th>
              <th className="pr-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {builtIn.map((r) => {
              const w = builtInListenerWords[r.relayId];
              return (
                <tr
                  key={r.relayId}
                  className="group h-[52px] border-b transition-colors last:border-b-0 hover:bg-hover"
                >
                  <td className="pr-3 pl-4">
                    <RelayNameCell relay={r} />
                  </td>
                  <td className="truncate px-3 text-fg-2">{w.reaches}</td>
                  <td className="px-3 font-mono text-xs text-fg-2 tabular">
                    {r.settings.port ?? w.defaultPort}
                  </td>
                  <td className="px-3">
                    <Carries relay={r} />
                  </td>
                  <td className="px-3 whitespace-nowrap">
                    <RelayConnectionLabel connection={r.connection} />
                  </td>
                  <td className="pr-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[13px] text-fg-2"
                        onClick={() => openConfigure(r.relayId)}
                      >
                        Configure
                      </Button>
                      <span className="size-7" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Hosted"
          hint="Joined at every start. Secrets are kept in the macOS keychain and never shown."
          action={<AddRelayMenu variant="outline" onPick={openAdd} />}
        />
        <div className="mx-5 overflow-hidden rounded-lg border">
          {hosted.length === 0 ? (
            <div className="px-4 py-8 text-center text-fg-3">
              No hosted relays. Public outputs reach the built-in listeners
              only.
            </div>
          ) : (
            <table className="w-full table-fixed border-collapse text-left">
              <RelayColumns />
              <thead>
                <tr className="border-b bg-chrome text-xs text-fg-3">
                  <th className="h-8 pr-3 pl-4 font-normal">Relay</th>
                  <th className="px-3 font-normal">Settings</th>
                  <th className="px-3 font-normal">Secrets</th>
                  <th className="px-3 font-normal">Carries</th>
                  <th className="px-3 font-normal">Status</th>
                  <th className="pr-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {hosted.map((r) => (
                  <HostedRows
                    key={r.relayId}
                    relay={r}
                    onConfigure={() => openConfigure(r.relayId)}
                    onRemove={() => setRemoveAsk(r.relayId)}
                    onRetryNow={() => retryNow(r.relayId)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-8">
        <SectionHeader
          title="Publishing"
          hint="Every public output reaches every relay above; there is no per-relay choice. Change an output's exposure on its stream's Outputs tab."
        />
        <div className="mx-5 overflow-hidden rounded-lg border">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[53%]" />
              <col className="w-[12%]" />
              <col />
              <col className="w-10" />
            </colgroup>
            <thead>
              <tr className="border-b bg-chrome text-xs text-fg-3">
                <th className="h-8 pr-3 pl-4 font-normal">Public output</th>
                <th className="px-3 font-normal">Kind</th>
                <th className="px-3 font-normal">Reaches</th>
                <th className="pr-3" />
              </tr>
            </thead>
            <tbody>
              {publicOutputs.map((o) => (
                <tr
                  key={`${o.stream.id}/${o.nodeId}/${o.port}`}
                  className="group relative h-9 border-b transition-colors last:border-b-0 hover:bg-hover"
                >
                  <td className="pr-3 pl-4">
                    <Link
                      to={`/streams/${o.stream.id}/outputs`}
                      className="flex min-w-0 items-center gap-1 font-mono text-xs after:absolute after:inset-0"
                    >
                      <span
                        className={cn(
                          "truncate",
                          o.stream.loaded ? "text-fg" : "text-fg-3",
                        )}
                      >
                        {o.stream.id}
                      </span>
                      <ChevronRight
                        className="size-3 shrink-0 text-fg-4"
                        strokeWidth={1.75}
                      />
                      <span className="truncate text-fg-2">{o.nodeId}</span>
                      <ChevronRight
                        className="size-3 shrink-0 text-fg-4"
                        strokeWidth={1.75}
                      />
                      <span className="truncate text-fg-2">{o.port}</span>
                    </Link>
                  </td>
                  <td className="px-3">
                    <span className="inline-flex items-center gap-1.5 text-fg-2">
                      <KindIcon kind={o.kind} />
                      {kindWords[o.kind].label}
                    </span>
                  </td>
                  <td className="relative z-10 px-3">
                    {o.stream.loaded ? (
                      <RelayLogoList relays={relays} />
                    ) : (
                      <span className="text-fg-3">
                        Not published ·{" "}
                        {o.stream.state === "failed"
                          ? "stream failed"
                          : "stream stopped"}
                      </span>
                    )}
                  </td>
                  <td className="pr-3">
                    <ChevronRight
                      className="ml-auto size-4 text-fg-4 group-hover:text-fg-3"
                      strokeWidth={1.75}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2.5 px-5 text-xs text-fg-3">
          {privateLoaded} private{" "}
          {privateLoaded === 1 ? "output stays" : "outputs stay"} on the
          loopback listener, for this machine only.
        </p>
      </div>

      <AddRelayDialog
        adapterKind={addKind}
        state={addState}
        relays={relays}
        onStateChange={(s) => update({ state: s === "editing" ? null : s })}
        onClose={() => update({ add: null, state: null })}
        onAdded={(r) => setAdded((a) => [...a, r])}
      />
      <ConfigureRelaySheet
        relay={configuring}
        state={configureState}
        onStateChange={(s) => update({ state: s === "editing" ? null : s })}
        onClose={() => update({ relay: null, state: null })}
        onRetryNow={retryNow}
        onRemove={remove}
      />
      <Dialog open={!!askRemove} onOpenChange={(o) => !o && setRemoveAsk(null)}>
        <DialogContent className="gap-0 p-0 sm:max-w-[420px]">
          {askRemove && (
            <>
              <div className="px-5 pt-4 pb-4">
                <DialogTitle className="text-[15px] leading-5 font-semibold">
                  Remove {relayDisplayName(askRemove)}?
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-[13px] text-fg-2">
                  This machine leaves{" "}
                  <span className="font-mono text-xs">{askRemove.relayId}</span>{" "}
                  and forgets it, along with its{" "}
                  {Object.keys(askRemove.secrets).join(" and ")} in the
                  keychain. Public outputs stop reaching it.
                </DialogDescription>
                <code className="mt-3 block font-mono text-xs text-fg-3">
                  tatolab relay rm {askRemove.relayId}
                </code>
              </div>
              <div className="flex justify-end gap-2 border-t bg-chrome px-5 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-[13px]"
                  onClick={() => setRemoveAsk(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 px-2.5 text-[13px]"
                  onClick={() => remove(askRemove.relayId)}
                >
                  Remove relay
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HostedRows({
  relay,
  onConfigure,
  onRemove,
  onRetryNow,
}: {
  relay: RelayInstance;
  onConfigure: () => void;
  onRemove: () => void;
  onRetryNow: () => void;
}) {
  const summary = settingsSummary(relay);
  const problem =
    relay.connection.state === "lost" ||
    (relay.connection.state === "not_joined" && !!relay.connection.why);
  return (
    <>
      <tr
        className={cn(
          "group h-[52px] transition-colors hover:bg-hover",
          problem ? "" : "border-b last:border-b-0",
        )}
      >
        <td className="pr-3 pl-4">
          <RelayNameCell relay={relay} />
        </td>
        <td className="px-3">
          <span
            className="block truncate text-fg-2"
            title={summary
              .map((x) => x.text + (x.isDefault ? " (default)" : ""))
              .join(" · ")}
          >
            {summary.length === 0 ? (
              <span className="text-fg-3">No other settings</span>
            ) : (
              summary.map((s, i) => (
                <span key={s.text}>
                  {i > 0 && <span className="text-fg-3"> · </span>}
                  {s.text}
                  {s.isDefault && <span className="text-fg-3"> (default)</span>}
                </span>
              ))
            )}
          </span>
        </td>
        <td className="px-3">
          {Object.entries(relay.secrets).map(([name, st]) => (
            <Tooltip key={name}>
              <TooltipTrigger
                render={<span className="block cursor-default truncate" />}
              >
                <span className="font-mono text-xs text-fg-2">{name}</span>
                <span className={st === "set" ? "text-fg-3" : "text-warn"}>
                  {" "}
                  · {st}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-60">
                {st === "set"
                  ? "In the macOS keychain. The runtime never returns its value."
                  : "Not set — the relay can't be joined until it is."}
              </TooltipContent>
            </Tooltip>
          ))}
        </td>
        <td className="px-3">
          <Carries relay={relay} />
        </td>
        <td className="px-3">
          <RelayConnectionLabel
            connection={relay.connection}
            className="max-w-full"
          />
        </td>
        <td className="pr-3">
          <div className="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[13px] text-fg-2"
              onClick={onConfigure}
            >
              Configure
            </Button>
            <span className="opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <IconButton
                icon={Trash2}
                label={`Remove ${adapterByKind(relay.adapter).name}`}
                onClick={onRemove}
              />
            </span>
          </div>
        </td>
      </tr>
      {problem && (
        <tr className="border-b last:border-b-0">
          <td colSpan={6} className="pr-4 pb-3 pl-[60px]">
            <RelayProblemDetail
              connection={relay.connection}
              relayName={relayDisplayName(relay)}
              onRetryNow={onRetryNow}
              className="rounded-md bg-chrome px-3 py-2"
            />
          </td>
        </tr>
      )}
    </>
  );
}

function RelayLogoList({ relays }: { relays: RelayInstance[] }) {
  const joined = relays.filter((r) => r.connection.state === "joined");
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="inline-flex shrink-0 items-center gap-1.5">
        {relays.map((r) => (
          <Tooltip key={r.relayId}>
            <TooltipTrigger
              render={
                <span
                  className={cn(
                    "inline-flex cursor-default",
                    r.connection.state !== "joined" && "opacity-40",
                  )}
                />
              }
            >
              <RelayLogo provider={r.adapter} className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-mono">{r.relayId}</span> ·{" "}
              {r.connection.state === "joined"
                ? "joined"
                : r.connection.state.replace("_", " ")}
            </TooltipContent>
          </Tooltip>
        ))}
      </span>
      <span className="truncate text-fg-3">
        {joined.length} of {relays.length} joined
      </span>
    </span>
  );
}
