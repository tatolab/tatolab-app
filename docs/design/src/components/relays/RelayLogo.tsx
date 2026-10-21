// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

import { Radio } from "lucide-react"
import { TatolabMark } from "@/components/brand/brand"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { RelayProvider } from "@/data/mock"
import { cn } from "@/lib/utils"
import { relayLookup } from "./relayData"

const logoSrc: Partial<Record<RelayProvider, string>> = {
  cloudflare: "/relays/cloudflare.svg",
  moqpro: "/relays/moqpro.svg",
  red5: "/relays/red5.svg",
  iroh: "/relays/iroh.png",
}

export const providerNames: Record<RelayProvider, string> = {
  local: "Local relay",
  cloudflare: "Cloudflare",
  moqpro: "moq.pro",
  red5: "Red5 Cloud",
  iroh: "iroh",
  custom: "Any MoQ relay",
}

/** A relay provider's logo at icon size; the built-in local relay uses the Tatolab mark. */
export function RelayLogo({ provider, className }: { provider: RelayProvider; className?: string }) {
  if (provider === "local") return <TatolabMark className={cn("size-4 shrink-0 text-fg-2", className)} />
  const src = logoSrc[provider]
  if (!src) return <Radio className={cn("size-4 shrink-0 text-fg-3", className)} strokeWidth={1.75} />
  return <img src={src} alt="" draggable={false} className={cn("size-4 shrink-0 object-contain select-none", className)} />
}

/** A row of relay logos, each with its name in a tooltip. */
export function RelayLogoRow({ relayIds, className }: { relayIds: string[]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {relayIds.map((id) => {
        const relay = relayLookup(id)
        if (!relay) return null
        return (
          <Tooltip key={id}>
            <TooltipTrigger render={<span className="inline-flex cursor-default" />}>
              <RelayLogo provider={relay.provider} className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{relay.name}</TooltipContent>
          </Tooltip>
        )
      })}
    </span>
  )
}
