import { FolderOpen, FolderPlus, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import welcomeBannerStillImageUrl from "../assets/welcome_banner_still.jpg";
import { SPLASH_DIALOG_BANNER_HEIGHT_PX, SPLASH_DIALOG_WIDTH_PX, SplashDialog, SplashDialogList, SplashDialogListRow } from "../design_system/splash_dialog";
import type { RecentProjectCardPresentation } from "../presentation/home_presentation";
import { WELCOME_BANNER_STILL_SECONDS, WelcomeBannerScene } from "./welcome_banner_scene";

/** How many recent projects the splash lists; Home lists them all. */
const RECENT_PROJECTS_ON_THE_SPLASH = 4;

/** The banner's live scene, playing while the splash is open; one still frame under reduced motion, and the still picture where WebGL is not offered. */
function WelcomeBanner() {
  const sceneHostElement = useRef<HTMLDivElement>(null);
  const [isTheSceneDrawn, setIsTheSceneDrawn] = useState(false);
  useEffect(() => {
    const sceneHost = sceneHostElement.current;
    if (sceneHost === null) return;
    const scene = WelcomeBannerScene.create(SPLASH_DIALOG_WIDTH_PX, SPLASH_DIALOG_BANNER_HEIGHT_PX);
    if (scene === null) return;
    scene.canvas.className = "block size-full";
    sceneHost.append(scene.canvas);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) scene.drawAt(WELCOME_BANNER_STILL_SECONDS);
    else scene.play(() => performance.now());
    setIsTheSceneDrawn(true);
    return () => {
      scene.stop();
      scene.canvas.remove();
    };
  }, []);
  return (
    <div ref={sceneHostElement} className="absolute inset-0" data-welcome-banner={isTheSceneDrawn ? "live" : "still"}>
      {!isTheSceneDrawn && <img src={welcomeBannerStillImageUrl} alt="" draggable={false} className="size-full object-cover select-none" />}
    </div>
  );
}

/** The Welcome splash over Home on first run: the live banner, then New and Recent. */
export function WelcomeSplashView({
  isOpen,
  onClosed,
  appVersion,
  recentProjects,
  onNewProject,
  onOpenAProjectFolder,
  onAllProjects,
  onRecentProjectOpened,
}: {
  isOpen: boolean;
  onClosed: () => void;
  appVersion: string;
  recentProjects: readonly RecentProjectCardPresentation[];
  onNewProject: () => void;
  onOpenAProjectFolder: () => void;
  onAllProjects: () => void;
  onRecentProjectOpened: (folder: string) => void;
}) {
  const andClose = (action: () => void) => () => {
    onClosed();
    action();
  };
  return (
    <SplashDialog
      isOpen={isOpen}
      onClosed={onClosed}
      title="Welcome to Tato Studio"
      appName="Tato Studio"
      versionWords={`v${appVersion}`}
      banner={isOpen && <WelcomeBanner />}
      data-welcome-splash=""
    >
      <SplashDialogList heading="New">
        <SplashDialogListRow icon={FolderPlus} words="New project" onPressed={andClose(onNewProject)} data-welcome-action="new" />
        <SplashDialogListRow icon={FolderOpen} words="Open…" onPressed={andClose(onOpenAProjectFolder)} data-welcome-action="open" />
        <SplashDialogListRow icon={LayoutGrid} words="All projects" onPressed={andClose(onAllProjects)} data-welcome-action="all_projects" />
      </SplashDialogList>
      <SplashDialogList heading="Recent">
        {recentProjects.length === 0 ? (
          <p className="h-8 text-sm leading-8 text-fg-3">None yet</p>
        ) : (
          recentProjects
            .slice(0, RECENT_PROJECTS_ON_THE_SPLASH)
            .map((project) => (
              <SplashDialogListRow
                key={project.folder}
                words={project.name}
                trailingWords={project.lastOpenedWords}
                onPressed={andClose(() => onRecentProjectOpened(project.folder))}
                data-welcome-recent-project={project.folder}
              />
            ))
        )}
      </SplashDialogList>
    </SplashDialog>
  );
}
