// Measures the Stream graph canvas on the mock's large graph (`?main_graph=large`: 300 cards, 450 links) in Chromium,
// with a stand-in control on each of the 1,200 inputs, plain elements whose value a 200-value feed sets at 60 Hz
// outside React. It reports each step's frame times and how many times a card rendered, counted from React's
// commits through the DevTools hook (a function component's fiber that ran carries React's PerformedWork flag). The
// window serves the core views as built for production, so the frame times are a production build's.
// Usage: [CHROMIUM_EXECUTABLE=<path>] node measure-the-canvas-frame-times.mjs <the mock window's URL, as serve_the_mock_window_in_a_browser.mjs prints it>
import { chromium } from "playwright";

const [, , mockWindowUrl = "http://localhost:5173/"] = process.argv;
const FEED_VALUES_PER_FRAME = 200;
const STEP_MILLISECONDS = 4000;

/** Runs in every frame before its scripts: counts the renders of each card and its pin sockets, by node id. */
function countTheCardRenders() {
  const PERFORMED_WORK = 1;
  const renders = { card: 0, pin: 0, cardsRendered: new Set() };
  window.__cardRenders = renders;
  // A subtree React skipped keeps the very child fibers of the commit before, whose flags are stale, so only the
  // children of a fiber worked on this commit are looked at.
  const countUnder = (next, previous) => {
    if (previous !== null && next.child === previous.child) return;
    for (let child = next.child; child !== null; child = child.sibling) {
      // The core views are a production build, whose names are minified, so a card is told by its props: React
      // Flow's for a node of type node_graph_card, and a pin socket by the props NodeGraphPinHandle takes.
      const props = typeof child.type === "function" && child.memoizedProps !== null && typeof child.memoizedProps === "object" ? child.memoizedProps : null;
      const didRender = props !== null && (child.flags & PERFORMED_WORK) !== 0;
      if (didRender && props.type === "node_graph_card" && "positionAbsoluteX" in props) {
        renders.card += 1;
        renders.cardsRendered.add(props.id);
      }
      if (didRender && "takesNewWires" in props && "side" in props && "pin" in props) renders.pin += 1;
      countUnder(child, child.alternate);
    }
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    inject(renderer) {
      this.renderers.set(this.renderers.size + 1, renderer);
      return this.renderers.size;
    },
    onCommitFiberRoot(_rendererId, root) {
      countUnder(root.current, root.current.alternate);
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
}

/** Runs in the canvas's frame: adds a stand-in control to every input row and starts the feed. */
function addTheStandInsAndTheFeed(valuesPerFrame) {
  const standIns = [];
  for (const inputName of document.querySelectorAll("[data-node-graph-input-pin]")) {
    if (inputName.getAttribute("data-node-graph-input-pin") === "") continue;
    const standIn = document.createElement("input");
    standIn.type = "range";
    standIn.min = "0";
    standIn.max = "1";
    standIn.step = "0.001";
    standIn.className = "nodrag";
    standIn.setAttribute("data-node-graph-inline-control", "");
    standIn.style.width = "64px";
    standIn.style.height = "12px";
    inputName.after(standIn);
    standIns.push(standIn);
  }
  let next = 0;
  const feed = (time) => {
    for (let fed = 0; fed < valuesPerFrame; fed += 1) {
      standIns[next].value = String((Math.sin(time / 300 + next) + 1) / 2);
      next = (next + 1) % standIns.length;
    }
    window.__feed = requestAnimationFrame(feed);
  };
  window.__feed = requestAnimationFrame(feed);
  return standIns.length;
}

/** Runs in the canvas's frame: records the time between frames until `stopFrameTimes` is called. */
function startFrameTimes() {
  const frameTimes = [];
  let before = null;
  const tick = (time) => {
    if (before !== null) frameTimes.push(time - before);
    before = time;
    window.__frameTimesTick = requestAnimationFrame(tick);
  };
  window.__frameTimes = frameTimes;
  window.__frameTimesTick = requestAnimationFrame(tick);
  window.__cardRenders.card = 0;
  window.__cardRenders.pin = 0;
  window.__cardRenders.cardsRendered.clear();
}

function stopFrameTimes() {
  cancelAnimationFrame(window.__frameTimesTick);
  return { frameTimes: window.__frameTimes, cardRenders: window.__cardRenders.card, pinRenders: window.__cardRenders.pin, cardsRendered: window.__cardRenders.cardsRendered.size };
}

const percentile = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];

function summary(step, { frameTimes, cardRenders, pinRenders, cardsRendered }) {
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const mean = frameTimes.reduce((sum, time) => sum + time, 0) / frameTimes.length;
  return {
    step,
    frames: frameTimes.length,
    "mean ms": mean.toFixed(1),
    "p50 ms": percentile(sorted, 0.5).toFixed(1),
    "p95 ms": percentile(sorted, 0.95).toFixed(1),
    "p99 ms": percentile(sorted, 0.99).toFixed(1),
    "max ms": sorted.at(-1).toFixed(1),
    "over 20 ms": frameTimes.filter((time) => time > 20).length,
    "card renders": cardRenders,
    "cards rendered": cardsRendered,
    "pin renders": pinRenders,
  };
}

// CHROMIUM_EXECUTABLE names a Chromium other than the one this Playwright downloads.
const browser = await chromium.launch({ executablePath: process.env["CHROMIUM_EXECUTABLE"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.addInitScript(countTheCardRenders);
await page.goto(new URL("?main_graph=large", mockWindowUrl).toString());
// The window opens on the open project's main stream, its graph in the Stream graph view's frame.
const canvasFrame = await (async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    for (const frame of page.frames()) {
      if ((await frame.locator(".react-flow__node-node_graph_card").count().catch(() => 0)) >= 300) return frame;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("the canvas never drew the large graph's 300 cards");
})();
await page.waitForTimeout(3000);
const results = [];
results.push(await measured("idle, zoomed out, no stand-ins", () => page.waitForTimeout(STEP_MILLISECONDS)));
const standInCount = await canvasFrame.evaluate(addTheStandInsAndTheFeed, FEED_VALUES_PER_FRAME);
const pane = await canvasFrame.locator(".react-flow__pane").boundingBox();
const viewportOfTheCanvas = await canvasFrame.locator(".react-flow__viewport").evaluate((element) => element.style.transform);
console.log(`cards: 300, stand-in controls: ${standInCount}, viewport after framing: ${viewportOfTheCanvas}`);

/** A spot of empty canvas near `x`, `y` in the page, where a drag pans rather than moves a card. */
async function emptySpotNear(x, y) {
  const frameBox = await (await canvasFrame.frameElement()).boundingBox();
  const spot = await canvasFrame.evaluate(
    ({ startX, startY }) => {
      for (let dx = 0; dx < 400; dx += 7) {
        for (let dy = 0; dy < 300; dy += 7) {
          const element = document.elementFromPoint(startX + dx, startY + dy);
          if (element?.classList.contains("react-flow__pane")) return { x: startX + dx, y: startY + dy };
        }
      }
      return null;
    },
    { startX: x - frameBox.x, startY: y - frameBox.y },
  );
  if (spot === null) throw new Error("no empty canvas to pan from");
  return { x: spot.x + frameBox.x, y: spot.y + frameBox.y };
}

async function measured(step, act) {
  await canvasFrame.evaluate(startFrameTimes);
  await act();
  return summary(step, await canvasFrame.evaluate(stopFrameTimes));
}

async function panFor(milliseconds) {
  const start = await emptySpotNear(pane.x + pane.width / 2, pane.y + pane.height / 2);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const startedAt = Date.now();
  let step = 0;
  while (Date.now() - startedAt < milliseconds) {
    step += 1;
    const swing = Math.sin(step / 20) * 300;
    await page.mouse.move(start.x + swing, start.y + swing / 2);
  }
  await page.mouse.up();
}

results.push(await measured("idle, zoomed out, feed running", () => page.waitForTimeout(STEP_MILLISECONDS)));
results.push(await measured("pan, zoomed out, feed running", () => panFor(STEP_MILLISECONDS)));
const middle = { x: pane.x + pane.width / 2, y: pane.y + pane.height / 2 };
await page.mouse.move(middle.x, middle.y);
for (let notch = 0; notch < 9; notch += 1) {
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(800);
console.log(`viewport zoomed in: ${await canvasFrame.locator(".react-flow__viewport").evaluate((element) => element.style.transform)}`);
results.push(await measured("idle, zoomed in, feed running", () => page.waitForTimeout(STEP_MILLISECONDS)));
results.push(await measured("pan, zoomed in, feed running", () => panFor(STEP_MILLISECONDS)));
let cardsClicked = 0;
const selectStep = await measured("select", async () => {
  const cardIds = await canvasFrame.evaluate(() => {
    const paneBox = document.querySelector(".react-flow__pane").getBoundingClientRect();
    const inView = [...document.querySelectorAll("[data-node-graph-card]")].filter((card) => {
      const box = card.getBoundingClientRect();
      return box.left > paneBox.left + 8 && box.top > paneBox.top + 48 && box.right < paneBox.right - 8 && box.bottom < paneBox.bottom - 8;
    });
    return inView.slice(0, 10).map((card) => card.getAttribute("data-node-graph-card"));
  });
  cardsClicked = cardIds.length;
  for (const cardId of cardIds) {
    await canvasFrame.locator(`[data-node-graph-card="${cardId}"] .node-graph-card-header`).click();
    await page.waitForTimeout(250);
  }
});
results.push({ ...selectStep, step: `select ${cardsClicked} cards in view one after another, zoomed in` });
await canvasFrame.evaluate(() => cancelAnimationFrame(window.__feed));
results.push(await measured("pan, zoomed in, feed stopped", () => panFor(STEP_MILLISECONDS)));
console.table(results);
await browser.close();
