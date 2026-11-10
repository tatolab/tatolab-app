// The core views drawn in their frames under happy-dom, which a window test reaches into as a
// person's pointer would. Each frame's page is answered with an empty `#view`, and the core view's
// component draws into it from the test's own module graph, over the port the window's real bridge
// hands the frame.

import { connectToTatoAppOverPort, VIEW_PORT_HANDOVER, type TatoAppViewConnection } from "@tatolab/tato-app-view-sdk";
import { HistoryView } from "@tatolab/tato-app-core-views/views/history";
import { OutlinerView } from "@tatolab/tato-app-core-views/views/outliner";
import { LibraryView } from "@tatolab/tato-app-core-views/views/library";
import { PropertiesView } from "@tatolab/tato-app-core-views/views/properties";
import { StreamGraphView } from "@tatolab/tato-app-core-views/views/stream_graph";
import { ViewerView } from "@tatolab/tato-app-core-views/views/viewer";
import { CodeView } from "@tatolab/tato-app-core-views/views/code";
import { TransactionsView } from "@tatolab/tato-app-core-views/views/transactions";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const CORE_VIEW_DRAWINGS: Record<string, (connection: TatoAppViewConnection) => ReactNode> = {
  stream_graph: (connection) => <StreamGraphView connection={connection} />,
  outliner: (connection) => <OutlinerView connection={connection} />,
  library: (connection) => <LibraryView connection={connection} />,
  properties: (connection) => <PropertiesView connection={connection} />,
  history: (connection) => <HistoryView connection={connection} />,
  viewer: (connection) => <ViewerView connection={connection} />,
  code: (connection) => <CodeView connection={connection} />,
  transactions: (connection) => <TransactionsView connection={connection} />,
};

const EMPTY_CORE_VIEW_PAGE = '<!doctype html><html lang="en" class="dark"><body><div id="view"></div></body></html>';

function happyDomSettingsOfThisWindow(): object | null {
  const happyDom: unknown = Reflect.get(window, "happyDOM");
  const settings: unknown = typeof happyDom === "object" && happyDom !== null ? Reflect.get(happyDom, "settings") : null;
  return typeof settings === "object" && settings !== null ? settings : null;
}

/** Node's `MessageChannel` makes the ports here, which are not happy-dom's `MessagePort`, so a port is known by its shape. */
function isAMessagePort(transferred: Transferable): transferred is MessagePort {
  return "postMessage" in transferred && "start" in transferred && "close" in transferred;
}

function isTheHandover(message: unknown): boolean {
  return typeof message === "object" && message !== null && "kind" in message && message.kind === VIEW_PORT_HANDOVER;
}

/** Loads each core view's frame and draws the view in it over the port Studio hands it; the returned stop unmounts every view drawn. */
export function drawTheCoreViewsInTheirFrames(): () => void {
  const settings = happyDomSettingsOfThisWindow();
  const fetchSettings: unknown = settings === null ? null : Reflect.get(settings, "fetch");
  const iframePageLoadingBefore: unknown = settings === null ? undefined : Reflect.get(settings, "enableIframePageLoading");
  const fetchInterceptorBefore: unknown = typeof fetchSettings === "object" && fetchSettings !== null ? Reflect.get(fetchSettings, "interceptor") : undefined;
  if (settings !== null) Reflect.set(settings, "enableIframePageLoading", true);
  if (typeof fetchSettings === "object" && fetchSettings !== null) {
    Reflect.set(fetchSettings, "interceptor", {
      beforeAsyncRequest: async ({ request, window: requestingWindow }: { request: Request; window: typeof globalThis }) =>
        new URL(request.url).pathname.includes("/core_views/")
          ? new requestingWindow.Response(EMPTY_CORE_VIEW_PAGE, { headers: { "content-type": "text/html" } })
          : undefined,
    });
  }
  const viewRootsByFrame = new Map<HTMLIFrameElement, { viewRoot: Root; viewElement: HTMLElement }>();
  const framesByTheirPage = new Map<Document, HTMLIFrameElement>();
  // happy-dom empties a frame's page the moment the frame leaves the window, while its view, drawn from
  // the test's module graph, can still commit a removal there; in Electron the page and its view go
  // together, so a removal from the page of a frame that has left is a removal already done.
  const removeChildPatches = new Map<object, unknown>();
  const takeRemovalsFromPagesOfFramesThatLeft = (nodeOfThePage: Node) => {
    let prototypeHoldingRemoveChild: object | null = Object.getPrototypeOf(nodeOfThePage);
    while (prototypeHoldingRemoveChild !== null && !Object.hasOwn(prototypeHoldingRemoveChild, "removeChild")) prototypeHoldingRemoveChild = Object.getPrototypeOf(prototypeHoldingRemoveChild);
    if (prototypeHoldingRemoveChild === null || removeChildPatches.has(prototypeHoldingRemoveChild)) return;
    const removeChild: unknown = Reflect.get(prototypeHoldingRemoveChild, "removeChild");
    if (typeof removeChild !== "function") return;
    removeChildPatches.set(prototypeHoldingRemoveChild, removeChild);
    Reflect.set(prototypeHoldingRemoveChild, "removeChild", function removeChildUnlessThePagesFrameLeft(this: Node, child: Node): unknown {
      const frameOfThePage = this.ownerDocument === null ? undefined : framesByTheirPage.get(this.ownerDocument);
      if (frameOfThePage !== undefined && !frameOfThePage.isConnected && child.parentNode !== this) return child;
      return Reflect.apply(removeChild, this, [child]);
    });
  };
  // happy-dom empties a frame's page as the frame leaves the window or loads its page again, so a view
  // whose page is gone is forgotten rather than unmounted; Studio's bridge closed its port with the page.
  const unmountTheView = (frame: HTMLIFrameElement) => {
    const drawnView = viewRootsByFrame.get(frame);
    viewRootsByFrame.delete(frame);
    if (drawnView !== undefined && frame.isConnected && drawnView.viewElement.isConnected) act(() => drawnView.viewRoot.unmount());
  };
  // Captured on the document, so it runs before the frame's own load listener posts the handover.
  const onAFrameLoaded = (loadEvent: Event) => {
    const frame = loadEvent.target;
    if (!(frame instanceof HTMLIFrameElement)) return;
    const drawTheView = CORE_VIEW_DRAWINGS[frame.dataset.tatolabView ?? ""];
    const frameWindow = frame.contentWindow;
    const viewElement = frame.contentDocument?.getElementById("view");
    if (drawTheView === undefined || frameWindow === null || viewElement === null || viewElement === undefined) return;
    framesByTheirPage.set(viewElement.ownerDocument, frame);
    takeRemovalsFromPagesOfFramesThatLeft(viewElement);
    const postTheMessage = frameWindow.postMessage.bind(frameWindow);
    // happy-dom's window.postMessage drops what it transfers, so the handover's port is taken here.
    frameWindow.postMessage = (message: unknown, targetOrigin: string | WindowPostMessageOptions = "*", transfer: Transferable[] = []) => {
      const port = transfer.find(isAMessagePort);
      if (!isTheHandover(message) || port === undefined) return postTheMessage(message, typeof targetOrigin === "string" ? targetOrigin : "*", transfer);
      void connectToTatoAppOverPort(port).then((connection) => {
        if (!frame.isConnected || !viewElement.isConnected) return;
        unmountTheView(frame);
        const viewRoot = createRoot(viewElement);
        viewRootsByFrame.set(frame, { viewRoot, viewElement });
        act(() => viewRoot.render(drawTheView(connection)));
      });
    };
  };
  document.addEventListener("load", onAFrameLoaded, true);
  return () => {
    document.removeEventListener("load", onAFrameLoaded, true);
    for (const [nodePrototype, removeChild] of removeChildPatches) Reflect.set(nodePrototype, "removeChild", removeChild);
    for (const frame of [...viewRootsByFrame.keys()]) unmountTheView(frame);
    if (settings !== null) Reflect.set(settings, "enableIframePageLoading", iframePageLoadingBefore);
    if (typeof fetchSettings === "object" && fetchSettings !== null) Reflect.set(fetchSettings, "interceptor", fetchInterceptorBefore);
  };
}
