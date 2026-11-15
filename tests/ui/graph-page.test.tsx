import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { createTestRuntime, useSharedTestRuntime } from "../setup/test-runtime.ts";
import {
  ambiguousUsername,
  graphAccountFullName,
  graphAccounts,
  lonelyAccount,
  mentionedName,
  seedGraphDatabase,
  unknownUsername,
} from "./seeded-pages.ts";

const shared = useSharedTestRuntime(seedGraphDatabase);
const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime), "/graph");
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const unknown = `@${unknownUsername}`;

beforeEach(() => {
  // jsdom lays nothing out: the graph's drawing gets the size of its viewBox, at the origin.
  vi.spyOn(globalThis.Element.prototype, "getBoundingClientRect").mockImplementation(
    function measure(this: Element) {
      return globalThis.DOMRect.fromRect(
        this instanceof globalThis.SVGSVGElement ? { width: 1000, height: 700 } : {},
      );
    },
  );
});

async function mountGraph() {
  const mounted = await renderer.mountRoute("/graph");
  const region = within(await screen.findByRole("region", { name: "Graphe des mentions" }));
  const drawing = region.getByRole("group", { name: "Points et connexions" });
  return { ...mounted, region, drawing, canvas: within(drawing) };
}

function highlightedConnections(drawing: HTMLElement) {
  return within(drawing)
    .getAllByRole("img", { name: /^Connexion/u })
    .filter((line) => line.dataset.highlighted === "true")
    .map((line) => line.getAttribute("aria-label"));
}

function readTranslate(element: Element) {
  const match = /translate\((?<x>[-\d.]+) (?<y>[-\d.]+)\)(?: scale\((?<scale>[-\d.]+)\))?/u.exec(
    element.getAttribute("transform") ?? "",
  );
  return {
    x: Number(match?.groups?.x),
    y: Number(match?.groups?.y),
    scale: Number(match?.groups?.scale ?? 1),
  };
}

function zoomPercent(level: HTMLElement): number {
  return Number(level.textContent.replace(/\s*%$/u, ""));
}

/** Where a point is drawn, in drawing units: its layout position through the view. */
function drawnAt(drawing: HTMLElement, point: Element) {
  const view = readTranslate(drawing.querySelector("g[transform]") ?? drawing);
  const position = readTranslate(point);
  return { x: view.x + view.scale * position.x, y: view.y + view.scale * position.y };
}

test("Accounts show their initials, anyone else an abstract point, unconnected Accounts nothing", async () => {
  const { canvas } = await mountGraph();
  expect(canvas.getAllByRole("button").map((point) => point.getAttribute("aria-label"))).toEqual([
    cleo,
    ada,
    ben,
    unknown,
    mentionedName,
    `@${ambiguousUsername} (plusieurs comptes)`,
    mentionedName,
  ]);
  expect(within(canvas.getByRole("button", { name: ada })).getByText("AD")).toBeInTheDocument();
  expect(canvas.getByRole("button", { name: unknown })).toHaveTextContent("");
  expect(canvas.queryByRole("button", { name: `@${lonelyAccount}` })).not.toBeInTheDocument();
});

test("one line per pair, thicker with more source stories", async () => {
  const { canvas } = await mountGraph();
  expect(canvas.getAllByRole("img", { name: /^Connexion/u })).toHaveLength(8);
  const twice = canvas.getByRole("img", { name: `Connexion entre ${ada} et ${ben} : 2 stories` });
  const once = canvas.getByRole("img", { name: `Connexion entre ${ada} et ${cleo} : 1 story` });
  expect(Number(twice.getAttribute("stroke-width"))).toBeGreaterThan(
    Number(once.getAttribute("stroke-width")),
  );
});

test("a known Account opens its profile and highlights its connections, the background clears it", async () => {
  const { user, canvas, drawing } = await mountGraph();
  const point = canvas.getByRole("button", { name: ada });
  await user.click(point);
  const profile = within(await screen.findByRole("dialog", { name: `Profil de ${ada}` }));
  expect(profile.getByText(graphAccountFullName)).toBeVisible();
  expect(profile.getByText(ada)).toBeVisible();
  expect(profile.getByText("AD")).toBeVisible();
  expect(profile.getByRole("link", { name: "Voir le profil" })).toHaveAttribute(
    "href",
    `/users/${graphAccounts[0]}`,
  );
  expect(point).toHaveAttribute("aria-pressed", "true");
  expect(highlightedConnections(drawing)).toEqual([
    `Connexion entre ${ada} et ${cleo} : 1 story`,
    `Connexion entre ${ada} et ${ben} : 2 stories`,
    `Connexion entre ${ada} et ${unknown} : 1 story`,
    `Connexion entre ${ada} et ${mentionedName} : 1 story`,
  ]);

  await user.click(drawing);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(point).toHaveAttribute("aria-pressed", "false");
  expect(highlightedConnections(drawing)).toEqual([]);
});

test("Escape closes the profile and clears the selection", async () => {
  const { user, canvas, drawing } = await mountGraph();
  await user.click(canvas.getByRole("button", { name: cleo }));
  expect(await screen.findByRole("dialog", { name: `Profil de ${cleo}` })).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(highlightedConnections(drawing)).toEqual([]);
});

test("an unknown point shows its label on hover and highlights its connections without a profile", async () => {
  const { user, canvas, drawing } = await mountGraph();
  await user.click(canvas.getByRole("button", { name: ada }));
  expect(await screen.findByRole("dialog", { name: `Profil de ${ada}` })).toBeVisible();

  const point = canvas.getByRole("button", { name: unknown });
  await user.hover(point);
  expect(canvas.getByRole("tooltip")).toHaveTextContent(unknown);
  await user.click(point);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(point).toHaveAttribute("aria-pressed", "true");
  expect(highlightedConnections(drawing)).toEqual([
    `Connexion entre ${cleo} et ${unknown} : 1 story`,
    `Connexion entre ${ada} et ${unknown} : 1 story`,
  ]);
  await user.unhover(point);
  expect(canvas.queryByRole("tooltip")).not.toBeInTheDocument();
});

test("the keyboard selects a point, shows its label, and Escape clears the selection", async () => {
  const { user, canvas, drawing } = await mountGraph();
  const point = canvas.getByRole("button", { name: unknown });
  act(() => {
    point.focus();
  });
  expect(canvas.getByRole("tooltip")).toHaveTextContent(unknown);
  await user.keyboard("{Enter}");
  expect(point).toHaveAttribute("aria-pressed", "true");
  expect(highlightedConnections(drawing)).toHaveLength(2);
  await user.keyboard("{Escape}");
  expect(point).toHaveAttribute("aria-pressed", "false");
  expect(highlightedConnections(drawing)).toEqual([]);
});

test("a press that barely moves is still a click", async () => {
  const { canvas, drawing } = await mountGraph();
  const point = canvas.getByRole("button", { name: unknown });
  const at = drawnAt(drawing, point);
  fireEvent.pointerDown(point, { button: 0, pointerId: 4, clientX: at.x, clientY: at.y });
  fireEvent.pointerMove(drawing, { pointerId: 4, clientX: at.x + 2, clientY: at.y + 1 });
  fireEvent.pointerUp(drawing, { pointerId: 4, clientX: at.x + 2, clientY: at.y + 1 });
  fireEvent.click(point);
  expect(point).toHaveAttribute("aria-pressed", "true");
  expect(drawnAt(drawing, point)).toEqual(at);
});

test("the controls zoom in and out, the wheel zooms, and recentering fits the graph again", async () => {
  const { user, region, drawing } = await mountGraph();
  const level = region.getByRole("status", { name: "Niveau de zoom" });
  const fitted = zoomPercent(level);
  await user.click(region.getByRole("button", { name: "Zoom avant" }));
  const zoomedIn = zoomPercent(level);
  expect(zoomedIn).toBeGreaterThan(fitted);
  await user.click(region.getByRole("button", { name: "Zoom arrière" }));
  expect(zoomPercent(level)).toBe(fitted);
  fireEvent.wheel(drawing, { deltaY: -500, clientX: 500, clientY: 350 });
  expect(zoomPercent(level)).toBeGreaterThan(zoomedIn);
  await user.click(region.getByRole("button", { name: "Recentrer le graphe" }));
  expect(zoomPercent(level)).toBe(fitted);
});

test("dragging the background pans the view without clearing the selection", async () => {
  const { user, canvas, drawing } = await mountGraph();
  const point = canvas.getByRole("button", { name: ben });
  await user.click(point);
  const before = drawnAt(drawing, point);
  fireEvent.pointerDown(drawing, { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(drawing, { pointerId: 2, clientX: 200, clientY: 150 });
  fireEvent.pointerUp(drawing, { pointerId: 2, clientX: 200, clientY: 150 });
  fireEvent.click(drawing);
  const after = drawnAt(drawing, point);
  expect(after.x - before.x).toBeCloseTo(100);
  expect(after.y - before.y).toBeCloseTo(50);
  expect(point).toHaveAttribute("aria-pressed", "true");
});

test("a dragged point follows the pointer and pulls its neighbours, then is let go", async () => {
  const { canvas, drawing } = await mountGraph();
  const point = canvas.getByRole("button", { name: ada });
  const neighbour = canvas.getByRole("button", { name: ben });
  const neighbourBefore = drawnAt(drawing, neighbour);
  const start = drawnAt(drawing, point);
  fireEvent.pointerDown(point, { button: 0, pointerId: 3, clientX: start.x, clientY: start.y });
  fireEvent.pointerMove(drawing, { pointerId: 3, clientX: 950, clientY: 650 });
  await waitFor(() => {
    expect(drawnAt(drawing, point).x).toBeCloseTo(950, 0);
    expect(drawnAt(drawing, point).y).toBeCloseTo(650, 0);
    expect(drawnAt(drawing, neighbour)).not.toEqual(neighbourBefore);
  });
  fireEvent.pointerUp(drawing, { pointerId: 3, clientX: 950, clientY: 650 });
  fireEvent.click(point);
  expect(point).toHaveAttribute("aria-pressed", "false");
  await waitFor(() => {
    expect(drawnAt(drawing, point).x).not.toBeCloseTo(950, 0);
  });
});

test("without any mention connection the page says so", async (context) => {
  const empty = loadMentionGraph(await createTestRuntime(context));
  await renderer.mountRoute("/graph", empty);
  expect(screen.getByText("Aucune mention à afficher")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Graphe des mentions" })).not.toBeInTheDocument();
});
