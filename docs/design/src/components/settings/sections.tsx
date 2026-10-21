// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { ArrowUpRight, ExternalLink, FolderOpen, SquareX, RotateCw } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"
import { Mascot } from "@/components/brand/brand"
import { relaySetups } from "@/components/relays/relayData"
import { CodeBlock } from "@/components/setup/CommandBlock"
import { useTheme } from "@/components/shell/theme"
import { Segmented } from "@/components/stream/Segmented"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { type Exposure, machines } from "@/data/mock"
import { exposureWords } from "@/lib/vocab"
import { SettingsGroup, SettingsRow, SettingsSelect } from "./SettingsForm"

const small = "h-7 gap-1.5 px-2.5 text-[13px]"

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs text-fg-2">{children}</span>
}

export function GeneralSection() {
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="Open Tatolab at login">
          <Switch defaultChecked />
        </SettingsRow>
        <SettingsRow label="Show in the menu bar" description="Runtime status and your streams, one click away.">
          <Switch defaultChecked />
        </SettingsRow>
        <SettingsRow label="When the window closes" description="Always-on streams keep running either way.">
          <SettingsSelect value="Keep dev sessions running" options={["Keep dev sessions running", "Stop dev sessions", "Ask every time"]} />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Projects">
        <SettingsRow label="New streams go in" description={<Mono>~/streams</Mono>}>
          <Button variant="outline" size="sm" className={small}>
            <FolderOpen className="size-3.5" /> Choose…
          </Button>
        </SettingsRow>
        <SettingsRow label="Open projects in">
          <SettingsSelect value="Cursor" options={["Cursor", "Visual Studio Code", "Zed", "Terminal"]} />
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const [mode, setMode] = useState<"light" | "dark" | "system">(theme)
  const [density, setDensity] = useState<"compact" | "comfortable">("compact")
  const choose = (m: "light" | "dark" | "system") => {
    setMode(m)
    if (m === "system") setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    else setTheme(m)
  }
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="Theme">
          <Segmented
            value={mode}
            onChange={choose}
            options={[
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
              { id: "system", label: "System" },
            ]}
          />
        </SettingsRow>
        <SettingsRow label="Density" description="Compact fits more rows in tables and lists.">
          <Segmented
            value={density}
            onChange={setDensity}
            options={[
              { id: "compact", label: "Compact" },
              { id: "comfortable", label: "Comfortable" },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Previews">
        <SettingsRow label="Play previews in lists" description="Thumbnails in tables show the live output. Off holds one frame.">
          <Switch defaultChecked />
        </SettingsRow>
        <SettingsRow label="Pause previews on battery">
          <Switch defaultChecked />
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}

export function RuntimeSection() {
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="Status" description={<span className="tabular">Running · pid 4121 · up 3d 2h</span>}>
          <Button variant="outline" size="sm" className={small}>
            <RotateCw className="size-3.5" /> Restart runtime
          </Button>
        </SettingsRow>
        <SettingsRow label="Version">
          <Mono>tatolabd 0.46.0</Mono>
        </SettingsRow>
        <SettingsRow label="Control socket" description="The CLI and this app talk to the runtime here.">
          <Mono>~/Library/Application Support/Tatolab/tatolabd.sock</Mono>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Compute">
        <SettingsRow label="GPU device" description="Every stream on this machine shares one device.">
          <SettingsSelect value="Apple M4 Max · 40-core" options={["Apple M4 Max · 40-core", "Software device (CPU)"]} className="min-w-56" />
        </SettingsRow>
        <SettingsRow label="Python for new streams" description="Each Python node runs in its own process with this interpreter.">
          <SettingsSelect value="3.12 (uv managed)" options={["3.13 (uv managed)", "3.12 (uv managed)", "3.11 (uv managed)", "/usr/bin/python3"]} />
        </SettingsRow>
        <SettingsRow label="Keep logs for">
          <SettingsSelect value="7 days" options={["1 day", "7 days", "30 days"]} />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow label="Stop the runtime" description="Stops every stream on studio-mac, including always-on ones.">
          <Button variant="destructive" size="sm" className={small}>
            Stop runtime
          </Button>
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}

const devices: { name: string; detail: string; state: "allowed" | "not-asked" | "denied" }[] = [
  { name: "Camera", detail: "FaceTime HD Camera, Studio Display Camera", state: "allowed" },
  { name: "Microphone", detail: "Shure MV7+, MacBook Pro Microphone", state: "allowed" },
  { name: "Screen recording", detail: "Needed by the Screen source.", state: "not-asked" },
  { name: "Virtual camera", detail: "The “Tatolab Camera” system extension.", state: "denied" },
]

export function DevicesSection() {
  return (
    <SettingsGroup description="macOS asks once per app. Streams on this machine use what the runtime is allowed.">
      {devices.map((d) => (
        <SettingsRow key={d.name} label={d.name} description={d.detail}>
          {d.state === "allowed" && <span className="text-fg-2">Allowed</span>}
          {d.state === "not-asked" && (
            <>
              <span className="text-fg-3">Not asked</span>
              <Button variant="outline" size="sm" className={small}>
                Ask
              </Button>
            </>
          )}
          {d.state === "denied" && (
            <>
              <span className="inline-flex items-center gap-1.5 text-danger">
                <SquareX className="size-3.5" strokeWidth={1.75} /> Denied
              </span>
              <Button variant="outline" size="sm" className={small}>
                Open System Settings <ExternalLink className="size-3" />
              </Button>
            </>
          )}
        </SettingsRow>
      ))}
    </SettingsGroup>
  )
}

export function RelaysSection() {
  const [exposure, setExposure] = useState<Exposure>("private")
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="Relay setup for this machine" description="studio-mac joins these relays when the runtime starts.">
          <SettingsSelect value="Studio" options={relaySetups.map((s) => s.name)} />
        </SettingsRow>
        <SettingsRow label="Default exposure for new outputs" description={exposureWords[exposure].long}>
          <Segmented
            value={exposure}
            onChange={setExposure}
            options={(["internal", "private", "public"] as Exposure[]).map((e) => ({ id: e, label: exposureWords[e].label }))}
          />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Local relay">
        <SettingsRow label="Listen on" description="Built in. Other machines on your tailnet read it directly.">
          <Mono>moq://studio-mac:4443</Mono>
        </SettingsRow>
        <SettingsRow label="Advertise on the tailnet">
          <Switch defaultChecked />
        </SettingsRow>
      </SettingsGroup>
      <Link to="/sharing" className="inline-flex items-center gap-1 px-1 text-brand-text hover:underline">
        Manage relays and setups <ArrowUpRight className="size-3.5" />
      </Link>
    </>
  )
}

const mcpConfig = `{
  "mcpServers": {
    "tatolab": {
      "command": "tatolab",
      "args": ["mcp"]
    }
  }
}`

const flags = [
  { id: "graph-editing", label: "Edit links in the graph", on: true },
  { id: "tensor-previews", label: "Preview tensor outputs as images", on: true },
  { id: "remote-terminal", label: "Terminal on remote machines", on: false },
  { id: "record-replay", label: "Record and replay a stream's inputs", on: false },
]

export function DeveloperSection() {
  const [mcp, setMcp] = useState(true)
  return (
    <>
      <SettingsGroup title="Command line">
        <SettingsRow label="tatolab CLI" description={<Mono>/opt/homebrew/bin/tatolab · 0.46.0</Mono>}>
          <Button variant="outline" size="sm" className={small}>
            Reinstall
          </Button>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Coding agents">
        <SettingsRow label="MCP server for coding agents" description="Lets Claude Code, Cursor and others list streams, read logs, tap ports and restart nodes.">
          <Switch checked={mcp} onCheckedChange={setMcp} />
        </SettingsRow>
        {mcp && (
          <div className="px-4 py-3">
            <p className="mb-2 text-xs text-fg-3">Add this to your agent's MCP config.</p>
            <CodeBlock code={mcpConfig} language="json" caption=".mcp.json" />
          </div>
        )}
      </SettingsGroup>
      <SettingsGroup title="Feature flags" description="Unfinished features. They may change or go away.">
        {flags.map((f) => (
          <SettingsRow key={f.id} label={f.label} description={<Mono>{f.id}</Mono>}>
            <Switch defaultChecked={f.on} />
          </SettingsRow>
        ))}
      </SettingsGroup>
    </>
  )
}

export function UpdatesSection() {
  const [channel, setChannel] = useState<"stable" | "beta">("stable")
  const behind = machines.filter((m) => m.runtimeVersion !== "0.46.0")
  return (
    <>
      <SettingsGroup>
        <SettingsRow label="Tatolab 1.4.0 · runtime 0.46.0" description="Up to date. Checked 12 minutes ago.">
          <Button variant="outline" size="sm" className={small}>
            Check now
          </Button>
        </SettingsRow>
        <SettingsRow label="Channel">
          <Segmented
            value={channel}
            onChange={setChannel}
            options={[
              { id: "stable", label: "Stable" },
              { id: "beta", label: "Beta" },
            ]}
          />
        </SettingsRow>
        <SettingsRow label="Download updates automatically">
          <Switch defaultChecked />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Other machines" description="Runtimes update one at a time. Always-on streams restart after.">
        {behind.map((m) => (
          <SettingsRow key={m.id} label={<span className="font-mono text-xs">{m.name}</span>} description={<span className="text-brand-text">0.46.0 available · on {m.runtimeVersion}</span>}>
            <Button size="sm" className={small}>
              Update
            </Button>
          </SettingsRow>
        ))}
        <SettingsRow label="Update other machines automatically" description="Only between 02:00 and 05:00 on each machine.">
          <Switch />
        </SettingsRow>
      </SettingsGroup>
    </>
  )
}

export function AboutSection() {
  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <Mascot className="size-[120px]" />
      <div className="mt-3 text-[20px] leading-[26px] font-semibold">Tatolab</div>
      <div className="text-fg-3 tabular">Version 1.4.0 · runtime 0.46.0</div>
      <div className="mt-4 flex gap-1.5">
        {["Documentation", "Release notes", "Third-party licences"].map((l) => (
          <Button key={l} variant="outline" size="sm" className={small}>
            {l}
          </Button>
        ))}
      </div>
      <p className="mt-6 max-w-sm text-xs text-fg-3">
        The runtime is licensed under the Business Source License 1.1 (BUSL-1.1).
        <br />© 2025 Jonathan Fontanez
      </p>
    </div>
  )
}
