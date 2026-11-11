// How a core view's page starts: the design system's stylesheet, the view's connection to Studio, and the
// view drawn in the view frame the SDK gives every view: its header row, then its toolbar row.

import "@tatolab/tato-app-view-sdk/design_system/styles/design_system.css";
import { connectToTatoApp, type TatoAppViewConnection, type ViewHeaderRow } from "@tatolab/tato-app-view-sdk";
import { StudioViewFrame } from "@tatolab/tato-app-view-sdk/design_system/studio_area_frame";
import { useViewReading } from "@tatolab/tato-app-view-sdk/design_system/view_readings";
import { WaitingState } from "@tatolab/tato-app-view-sdk/design_system/waiting_state";
import { useCallback, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

const HEADER_ROW_BEFORE_STUDIO_SAYS: ViewHeaderRow = { leading_inset_px: 0, height_px: 30 };

/** A core view's whole frame: its header row, holding only Studio's view-type menu, then its toolbar row named `toolbarLabel` holding `toolbarTools`, over `children`. */
export function CoreViewFrame({ connection, toolbarLabel, toolbarTools, children }: { connection: TatoAppViewConnection; toolbarLabel: string; toolbarTools?: ReactNode; children: ReactNode }) {
  const headerRow = useViewReading(useCallback((listener: (headerRow: ViewHeaderRow) => void) => connection.watchHeaderRow(listener), [connection]));
  return (
    <StudioViewFrame headerRow={headerRow ?? HEADER_ROW_BEFORE_STUDIO_SAYS} toolbarLabel={toolbarLabel} toolbarTools={toolbarTools}>
      {children}
    </StudioViewFrame>
  );
}

/** Draws the core view `drawTheView` makes into the page's `#view` once Studio has handed the frame its connection. */
export function startTheCoreView(drawTheView: (connection: TatoAppViewConnection) => ReactNode): void {
  const viewRoot = createRoot(document.getElementById("view") ?? document.body);
  viewRoot.render(<WaitingState title="Connecting to Tato Studio" />);
  void connectToTatoApp().then((connection) => viewRoot.render(drawTheView(connection)));
}
