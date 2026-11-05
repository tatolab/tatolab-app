import { FolderOpen, RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { ActionButton } from "../design_system/action_button";
import { PendingActionWords } from "../design_system/pending_action_words";
import { RefusalLine } from "../design_system/refusal_line";
import { windowDragRegionAttribute } from "../presentation/platform_presentation";
import type { RuntimeInstallOverlayPresentation } from "../presentation/runtime_install_presentation";
import { useActionThroughTheBackend } from "./action_through_the_backend";
import { useTatolabWindowEnvironment } from "./tatolab_window_context";

/** The installer's lines as it writes them, kept scrolled to the newest. */
function InstallerLines({ installerLines }: { installerLines: readonly string[] }) {
  const linesWellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const linesWell = linesWellRef.current;
    if (linesWell !== null) linesWell.scrollTop = linesWell.scrollHeight;
  }, [installerLines.length]);
  return (
    <div
      ref={linesWellRef}
      className="scrollbar-thin mt-5 max-h-[280px] min-h-[120px] overflow-y-auto rounded-md bg-well px-3 py-2.5"
      data-runtime-install-lines
    >
      <pre className="font-mono text-xs leading-[18px] whitespace-pre-wrap text-fg select-text" aria-live="polite">
        {installerLines.join("\n")}
      </pre>
    </div>
  );
}

/** Installing the runtime the app carries, over the whole window so nothing acts on a runtime being replaced: the installer's lines, and its refusal with Try again and Open log. */
export function RuntimeInstallOverlayView({ overlay }: { overlay: RuntimeInstallOverlayPresentation }) {
  const { backend, platform } = useTatolabWindowEnvironment();
  const tryAgain = useActionThroughTheBackend(() => backend.installTheCarriedRuntimeAgain(), "Couldn't try again:");
  const openRuntimeLogFolder = useActionThroughTheBackend(() => backend.openRuntimeLogFolder(), "Couldn't open the runtime's log folder:");
  const actionRefusal = [openRuntimeLogFolder.refusal, tryAgain.refusal].find((refusal) => refusal !== null && refusal.words !== overlay.refusal) ?? null;
  return (
    <div className="flex h-screen flex-col bg-window text-fg" data-runtime-install-overlay={overlay.stage}>
      <div className="h-(--page-bar-height) shrink-0" data-window-drag-region={windowDragRegionAttribute(platform, "self") ?? undefined} />
      <main className="scrollbar-thin flex min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-[560px] max-w-full px-8 pt-[8vh] pb-10">
          <h1 className="title-lg">{overlay.heading}</h1>
          <p className="mt-1 text-fg-2">{overlay.explanation}</p>
          <InstallerLines installerLines={overlay.installerLines} />
          {overlay.refusal !== null && <RefusalLine lead="The installer said:" words={overlay.refusal} />}
          {actionRefusal !== null && <RefusalLine lead={actionRefusal.lead} words={actionRefusal.words} />}
        </div>
      </main>
      <footer className="shrink-0 border-t bg-chrome">
        <div className="mx-auto flex h-14 w-[560px] max-w-full items-center justify-end gap-2 px-8">
          {overlay.stage === "installing" || tryAgain.isPending ? (
            <PendingActionWords words="Installing…" />
          ) : (
            <>
              <ActionButton icon={FolderOpen} isDisabled={openRuntimeLogFolder.isPending} onPressed={openRuntimeLogFolder.run} data-runtime-install-action="open_log">
                Open log
              </ActionButton>
              <ActionButton appearance="primary" icon={RotateCw} hasFocusOnOpen onPressed={tryAgain.run} data-runtime-install-action="try_again">
                Try again
              </ActionButton>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
