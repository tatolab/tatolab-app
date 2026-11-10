// How a core view's page starts: the design system's stylesheet, the view's connection to Studio, and the
// view drawn under its own header row, after Studio's view-type menu.

import "@tatolab/tato-app-view-sdk/design_system/styles/design_system.css";
import { connectToTatoApp, type TatoAppViewConnection, type ViewHeaderRow } from "@tatolab/tato-app-view-sdk";
import { StudioAreaHeaderRowInAFrame } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { useCallback, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const HEADER_ROW_BEFORE_STUDIO_SAYS: ViewHeaderRow = { leading_inset_px: 0, height_px: 30 };

/** A core view's whole frame: its header row, holding `headerCaption` or `headerTools` after Studio's view-type menu, over `children`. */
export function CoreViewFrame({
  connection,
  headerCaption,
  headerTools,
  children,
}: {
  connection: TatoAppViewConnection;
  /** Words naming what the view shows now, as the project or stream it reads; `null` for none. */
  headerCaption?: string | null;
  headerTools?: ReactNode;
  children: ReactNode;
}) {
  const headerRow = useViewReading(useCallback((listener: (headerRow: ViewHeaderRow) => void) => connection.watchHeaderRow(listener), [connection]));
  return (
    <div className="flex h-screen min-h-0 flex-col bg-studio-area text-fg">
      <StudioAreaHeaderRowInAFrame headerRow={headerRow ?? HEADER_ROW_BEFORE_STUDIO_SAYS}>
        {headerCaption !== undefined && headerCaption !== null && <span className="truncate text-2xs text-fg-3">{headerCaption}</span>}
        {headerTools}
      </StudioAreaHeaderRowInAFrame>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Draws the core view `drawTheView` makes into the page's `#view` once Studio has handed the frame its connection. */
export function startTheCoreView(drawTheView: (connection: TatoAppViewConnection) => ReactNode): void {
  const viewRoot = createRoot(document.getElementById("view") ?? document.body);
  viewRoot.render(<WaitingState title="Connecting to Tato Studio" />);
  void connectToTatoApp().then((connection) => viewRoot.render(drawTheView(connection)));
}
