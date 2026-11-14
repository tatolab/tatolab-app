import { Pause, Play, Square, type LucideIcon } from "lucide-react";
import { StudioSplitMenuButton } from "@tatolab/tato-app-view-sdk/design_system/menu_bar";
import type { ProjectPlaybackChoice, ProjectPlaybackControls } from "../presentation/project_playback_presentation";
import { projectPlaybackCommandOf, projectPlaybackMenuEntries, type StudioMenuBarCommands } from "./studio_menu_bar_model";

const PROJECT_PLAYBACK_CHOICE_ICONS: Readonly<Record<ProjectPlaybackChoice["label"], LucideIcon>> = { Play, Resume: Play, Pause, Stop: Square };

/** The title row's player control, before its layout buttons: a button that takes the playback's next step, and a chevron that opens Run's playback entries. */
export function StudioTitleRowPlayerControl({ playbackControls, commands }: { playbackControls: ProjectPlaybackControls; commands: StudioMenuBarCommands }) {
  const { lead } = playbackControls;
  return (
    <StudioSplitMenuButton
      icon={PROJECT_PLAYBACK_CHOICE_ICONS[lead.label]}
      label={`${lead.label} the project`}
      unavailableBecause={lead.unavailable_because}
      isLive={playbackControls.is_live}
      onPressed={projectPlaybackCommandOf(lead.asked_for, commands)}
      menuLabel="Playback choices"
      entries={projectPlaybackMenuEntries(playbackControls, commands)}
      data-studio-player-control={lead.asked_for}
      menuDataAttributes={{ "data-studio-player-control-menu": "" }}
    />
  );
}
