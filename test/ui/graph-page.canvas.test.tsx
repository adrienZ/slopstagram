import { act, createEvent, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { mockJsdomPolyfillValue } from "../setup/define-property.ts";
import { shareTestRuntime } from "../setup/test-runtime.ts";
import { graphAccounts, seedGraphDatabase } from "../setup/mention-graph-seed.ts";

const shared = shareTestRuntime(seedGraphDatabase);
const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime, []), "/graph");
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);

// A full cool-down, the refit after it, and the throttled repaint of force-graph's hit canvas.
const SETTLE_MS = 6000;

beforeEach(() => {
  // force-graph lays out and animates frame by frame: tests step through time instead of waiting.
  vi.useFakeTimers({
    toFake: [
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
      "Date",
      "setTimeout",
      "clearTimeout",
    ],
  });
  // jsdom has no layout: the graph gets the size a browser would give it.
  mockJsdomPolyfillValue(globalThis.Element.prototype, "clientWidth", { get: () => 800 });
  mockJsdomPolyfillValue(globalThis.Element.prototype, "clientHeight", { get: () => 600 });
});

afterEach(() => {
  vi.useRealTimers();
});

const FRAME_MS = 16;

// Frame by frame, so React commits between frames as it would in a browser.
async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
    // oxlint-disable-next-line no-await-in-loop -- Each frame needs the previous one's commit.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FRAME_MS);
    });
  }
}

// user-event and React Testing Library's async helpers wait on setTimeout, which these tests fake:
// events go through fireEvent instead.
let fillText: MockInstance<CanvasRenderingContext2D["fillText"]>;
let context: CanvasRenderingContext2D;

async function watchCanvas(container: HTMLElement) {
  await vi.waitFor(() => screen.getByRole("toolbar", { name: "Commandes du graphe" }));

  // force-graph's canvas has no role: it only draws what the accessible buttons already offer.
  const drawing = container.querySelector("canvas")?.getContext("2d");

  if (drawing === null || drawing === undefined) {
    throw new Error("force-graph drew no canvas");
  }

  context = drawing;
  // jsdom draws through @napi-rs/canvas, whose pixels say nothing about which point is where.
  fillText = vi.spyOn(context, "fillText");
}

async function mountGraph() {
  const { container } = await renderer.mountRoute("/graph");
  await watchCanvas(container);
}

async function settle() {
  await mountGraph();
  await advance(SETTLE_MS);
}

async function press(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  await advance(300);
}

/** Where the last frame wrote `text` on the canvas, in canvas pixels. */
function findPaintedText(text: string) {
  const call = fillText.mock.calls.findLast(([written]) => written === text);
  const { a, d, e, f } = context.getTransform();

  return call && { canvas: context.canvas, x: a * call[1] + e, y: d * call[2] + f };
}

function paintedAt(text: string) {
  const painted = findPaintedText(text);

  if (painted === undefined) {
    throw new Error(`Nothing painted “${text}”`);
  }

  return painted;
}

function zoomLevel() {
  return screen.getByRole("status", { name: "Niveau de zoom" }).textContent;
}

interface CanvasPoint {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

type PointerEventName =
  | "pointerMove"
  | "pointerDown"
  | "pointerUp"
  | "mouseMove"
  | "mouseDown"
  | "mouseUp";

function firePointer(type: PointerEventName, { canvas, x, y }: CanvasPoint, buttons = 0) {
  const event = createEvent[type](canvas, {
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    pointerType: "mouse",
  });

  // d3's drag and zoom read the event's window, which jsdom only accepts as its own internal one.
  Object.defineProperty(event, "view", { value: globalThis });
  fireEvent(canvas, event);
}

async function hoverCanvas(at: CanvasPoint) {
  firePointer("pointerMove", at);
  firePointer("mouseMove", at);
  await advance(100);
}

function pressCanvas(at: CanvasPoint) {
  firePointer("pointerMove", at);
  firePointer("pointerDown", at, 1);
  firePointer("mouseDown", at, 1);
}

function releaseCanvas(at: CanvasPoint) {
  firePointer("pointerUp", at);
  firePointer("mouseUp", at);
}

async function clickCanvas(at: CanvasPoint) {
  pressCanvas(at);
  releaseCanvas(at);
  await advance(100);
}

test("the graph says it is loading until its first frame shows every Account", async () => {
  const { container } = await renderer.mountRoute("/graph");
  expect(screen.getByText("Chargement du graphe…")).toBeVisible();
  await watchCanvas(container);
  await advance(100);
  expect(screen.queryByText("Chargement du graphe…")).not.toBeInTheDocument();
  expect(["AD", "BE", "CL"].map((initials) => findPaintedText(initials))).not.toContain(undefined);
});

test("clicking a point on the canvas selects it like its button", async () => {
  await settle();
  await clickCanvas(paintedAt("AD"));
  expect(screen.getByRole("dialog", { name: `Profil de ${ada}` })).toBeVisible();
  expect(screen.getByRole("button", { name: ada })).toHaveAttribute("aria-pressed", "true");
});

test("clicking the canvas background clears the selection", async () => {
  await settle();
  const point = paintedAt("CL");
  await clickCanvas(point);
  expect(screen.getByRole("dialog", { name: `Profil de ${cleo}` })).toBeVisible();

  await clickCanvas({ canvas: point.canvas, x: 2, y: 2 });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: cleo })).toHaveAttribute("aria-pressed", "false");
});

test("clicking a connection on the canvas opens its stories", async () => {
  await settle();
  const from = paintedAt("AD");
  const to = paintedAt("CL");
  await clickCanvas({ canvas: from.canvas, x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 });
  expect(
    screen.getByRole("region", { name: `Stories de la connexion entre ${ada} et ${cleo}` }),
  ).toBeVisible();
});

test("hovering a point names it just above the point", async () => {
  await settle();
  const point = paintedAt("BE");
  expect(findPaintedText(ben)).toBeUndefined();

  await hoverCanvas(point);
  const label = paintedAt(ben);
  expect(label.x).toBe(point.x);
  expect(label.y).toBeLessThan(point.y);
});

test("focusing a point's button names it on the canvas too", async () => {
  await settle();
  act(() => {
    screen.getByRole("button", { name: ada }).focus();
  });
  await advance(100);
  expect(paintedAt(ada).x).toBe(paintedAt("AD").x);
});

test("the zoom buttons step the zoom, and recentering shows the whole graph again", async () => {
  await settle();
  const fitted = zoomLevel();

  await press("Zoom avant");
  expect(zoomLevel()).not.toBe(fitted);

  await press("Zoom arrière");
  expect(zoomLevel()).toBe(fitted);

  await press("Zoom avant");
  await press("Recentrer le graphe");
  expect(zoomLevel()).toBe(fitted);
});

test("once the view was moved, the settling layout no longer refits it", async () => {
  await mountGraph();
  await advance(100);
  const { canvas } = paintedAt("AD");
  await clickCanvas({ canvas, x: 2, y: 2 });
  await press("Zoom avant");
  const zoomed = zoomLevel();

  await advance(SETTLE_MS);
  expect(zoomLevel()).toBe(zoomed);
});
