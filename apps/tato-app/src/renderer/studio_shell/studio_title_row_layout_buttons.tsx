import { LayoutTemplate, PanelBottom, PanelBottomDashed, PanelLeft, PanelLeftDashed, PanelRight, PanelRightDashed, type LucideIcon } from "lucide-react";
import type { TatolabPlatform } from "../../shared/tatolab_backend_contract";
import { StudioMenuButton } from "@tatolab/tato-app-view-sdk/design_system/menu_bar";
import { ToggleIconButton } from "@tatolab/tato-app-view-sdk/design_system/toggle_icon_button";
import { studioLayoutHasAnAreaAt, type StudioLayoutEdge } from "./studio_layout_shapes";
import type { StudioLayoutsOfAFolder } from "./studio_layouts";
import { studioLayoutMenuEntries, type StudioMenuBarCommands } from "./studio_menu_bar_model";
import type { StudioWindowModel } from "./studio_window_model";

/** Each edge's button: a dashed panel while its area is hidden, a drawn one while it shows. */
const LAYOUT_EDGE_BUTTONS: readonly { edge: StudioLayoutEdge; iconWhileShown: LucideIcon; iconWhileHidden: LucideIcon; words: string }[] = [
  { edge: "left", iconWhileShown: PanelLeft, iconWhileHidden: PanelLeftDashed, words: "left" },
  { edge: "bottom", iconWhileShown: PanelBottom, iconWhileHidden: PanelBottomDashed, words: "bottom" },
  { edge: "right", iconWhileShown: PanelRight, iconWhileHidden: PanelRightDashed, words: "right" },
];

/** The title row's layout buttons at its end: one that shows or hides each of the chosen layout's left, bottom and right areas, then the layout menu. */
export function StudioTitleRowLayoutButtons({
  model,
  studioLayouts,
  commands,
  platform,
}: {
  model: StudioWindowModel;
  studioLayouts: StudioLayoutsOfAFolder;
  commands: StudioMenuBarCommands;
  platform: TatolabPlatform;
}) {
  const chosenLayout = studioLayouts.layouts[studioLayouts.chosen_layout];
  const edgesHidden = studioLayouts.edges_hidden[studioLayouts.chosen_layout];
  return (
    <div className="flex shrink-0 items-center gap-0.5" data-studio-layout-buttons="">
      {LAYOUT_EDGE_BUTTONS.filter(({ edge }) => studioLayoutHasAnAreaAt(chosenLayout, edge)).map(({ edge, iconWhileShown, iconWhileHidden, words }) => (
        <ToggleIconButton
          key={edge}
          icon={iconWhileHidden}
          iconWhileOn={iconWhileShown}
          pressedLook="icon_alone"
          label={`Show the ${words} area`}
          tooltipWhileOn={`Hide the ${words} area`}
          tooltipWhileOff={`Show the ${words} area`}
          isOn={!edgesHidden[edge]}
          onToggled={() => model.toggleTheChosenLayoutsEdge(edge)}
          data-studio-layout-edge={edge}
        />
      ))}
      <StudioMenuButton
        icon={LayoutTemplate}
        label="Layout"
        entries={studioLayoutMenuEntries(platform, { chosen_layout: studioLayouts.chosen_layout, preset_titles_saved: studioLayouts.presets_saved.map(({ title }) => title) }, commands)}
        data-studio-layout-menu=""
      />
    </div>
  );
}
