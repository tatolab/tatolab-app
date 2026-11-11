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
  // happy-dom empties a frame's page the moment the frame leaves the window or loads its page again,
  // while its view, drawn from the test's module graph, can still commit a removal or an insertion
  // there; in Electron the page and its view go together, so a change to a page that is gone is one
  // that never happens.
  const childListPatches = new Map<object, { removeChild: unknown; insertBefore: unknown }>();
  const isInAPageThatIsGone = (nodeOfThePage: Node) => {
    if (nodeOfThePage.ownerDocument === null) return false;
    const frameOfThePage = framesByTheirPage.get(nodeOfThePage.ownerDocument);
    return frameOfThePage !== undefined && (!frameOfThePage.isConnected || !nodeOfThePage.isConnected);
  };
  const takeChangesToPagesThatAreGone = (nodeOfThePage: Node) => {
    let prototypeHoldingTheChildList: object | null = Object.getPrototypeOf(nodeOfThePage);
    while (prototypeHoldingTheChildList !== null && !Object.hasOwn(prototypeHoldingTheChildList, "removeChild")) prototypeHoldingTheChildList = Object.getPrototypeOf(prototypeHoldingTheChildList);
    if (prototypeHoldingTheChildList === null || childListPatches.has(prototypeHoldingTheChildList)) return;
    const removeChild: unknown = Reflect.get(prototypeHoldingTheChildList, "removeChild");
    const insertBefore: unknown = Reflect.get(prototypeHoldingTheChildList, "insertBefore");
    if (typeof removeChild !== "function" || typeof insertBefore !== "function") return;
    childListPatches.set(prototypeHoldingTheChildList, { removeChild, insertBefore });
    Reflect.set(prototypeHoldingTheChildList, "removeChild", function removeChildUnlessThePageIsGone(this: Node, child: Node): unknown {
      if (child.parentNode !== this && isInAPageThatIsGone(this)) return child;
      return Reflect.apply(removeChild, this, [child]);
    });
    Reflect.set(prototypeHoldingTheChildList, "insertBefore", function insertBeforeUnlessThePageIsGone(this: Node, newChild: Node, referenceChild: Node | null): unknown {
      if (referenceChild !== null && referenceChild.parentNode !== this && isInAPageThatIsGone(this)) return newChild;
      return Reflect.apply(insertBefore, this, [newChild, referenceChild]);
    });
  };
  // happy-dom empties a frame's page as the frame leaves the window or loads its page again, so a view
  // whose page is gone is set aside rather than unmounted; Studio's bridge closed its port with the page.
  // The test's cleanup unmounts each one set aside, so none commits into a later test's window.
  const viewRootsWhosePageIsGone = new Set<Root>();
  const unmountTheView = (frame: HTMLIFrameElement) => {
    const drawnView = viewRootsByFrame.get(frame);
    viewRootsByFrame.delete(frame);
    if (drawnView === undefined) return;
    if (frame.isConnected && drawnView.viewElement.isConnected) act(() => drawnView.viewRoot.unmount());
    else viewRootsWhosePageIsGone.add(drawnView.viewRoot);
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
    takeChangesToPagesThatAreGone(viewElement);
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
    for (const frame of [...viewRootsByFrame.keys()]) unmountTheView(frame);
    for (const viewRoot of viewRootsWhosePageIsGone) act(() => viewRoot.unmount());
    viewRootsWhosePageIsGone.clear();
    for (const [nodePrototype, { removeChild, insertBefore }] of childListPatches) {
      Reflect.set(nodePrototype, "removeChild", removeChild);
      Reflect.set(nodePrototype, "insertBefore", insertBefore);
    }
    if (settings !== null) Reflect.set(settings, "enableIframePageLoading", iframePageLoadingBefore);
    if (typeof fetchSettings === "object" && fetchSettings !== null) Reflect.set(fetchSettings, "interceptor", fetchInterceptorBefore);
  };
}
