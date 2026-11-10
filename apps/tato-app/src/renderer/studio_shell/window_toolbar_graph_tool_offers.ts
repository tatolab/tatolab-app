import type { WindowToolbarGraphTool, WindowToolbarGraphToolOffered } from "@tatolab/tato-app-view-sdk";
import type { GraphToolsOfferInTheWindowToolbar } from "../view_host/tatolab_view_bridge";
import { WatchedStudioValue } from "../view_host/watched_studio_value";

/** The graph tools the window's toolbar shows, from the area whose view offered them, and how a press reaches that view. */
export interface WindowToolbarGraphToolsShown {
  area_id: string;
  /** Which offer of the window this is, so a new offer of the same tools from the same area still reaches its own view. */
  offer_number: number;
  tools: readonly WindowToolbarGraphToolOffered[];
  press(tool: WindowToolbarGraphTool): void;
}

interface GraphToolOfferFromAnArea {
  area_id: string;
  offer_number: number;
  tools: readonly WindowToolbarGraphToolOffered[];
  onToolPressed: (tool: WindowToolbarGraphTool) => void;
}

/** The graph tool offers of the window's areas, and the one its toolbar shows: among the offers that name their tools yet, the latest from the area the person last worked in, else the latest. */
export class WindowToolbarGraphToolOffers {
  readonly shown = new WatchedStudioValue<WindowToolbarGraphToolsShown | null>(null);
  private readonly offersNewestLast: GraphToolOfferFromAnArea[] = [];
  private areaIdLastWorkedIn: string | null = null;
  private offersMade = 0;

  /** An offer from `areaId`'s view, shown in place of any offer before it from that area. */
  offerFrom(areaId: string, onToolPressed: (tool: WindowToolbarGraphTool) => void): GraphToolsOfferInTheWindowToolbar {
    this.offersMade += 1;
    const offer: GraphToolOfferFromAnArea = { area_id: areaId, offer_number: this.offersMade, tools: [], onToolPressed };
    this.offersNewestLast.push(offer);
    this.showTheChosenOffer();
    return {
      kind: "offered",
      show: (tools) => {
        offer.tools = tools;
        this.showTheChosenOffer();
      },
      withdraw: () => {
        const offerIndex = this.offersNewestLast.indexOf(offer);
        if (offerIndex === -1) return;
        this.offersNewestLast.splice(offerIndex, 1);
        this.showTheChosenOffer();
      },
    };
  }

  /** The person pressed or focused in `areaId`, so its offer, once it has one, is the toolbar's. */
  personWorkedInTheArea(areaId: string): void {
    if (this.areaIdLastWorkedIn === areaId) return;
    if (!this.offersNewestLast.some((offer) => offer.area_id === areaId)) return;
    this.areaIdLastWorkedIn = areaId;
    this.showTheChosenOffer();
  }

  private showTheChosenOffer(): void {
    const offersShowingTools = this.offersNewestLast.filter((offer) => offer.tools.length > 0);
    const chosen = offersShowingTools.filter((offer) => offer.area_id === this.areaIdLastWorkedIn).at(-1) ?? offersShowingTools.at(-1) ?? null;
    if (chosen === null) {
      this.shown.publish(null);
      return;
    }
    this.shown.publish({
      area_id: chosen.area_id,
      offer_number: chosen.offer_number,
      tools: chosen.tools,
      press: (tool) => {
        if (!this.offersNewestLast.includes(chosen)) return;
        if (chosen.tools.find((offered) => offered.tool === tool)?.disabled_reason !== null) return;
        chosen.onToolPressed(tool);
      },
    });
  }
}
