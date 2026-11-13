import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { useSharedTestRuntime } from "../setup/test-runtime.ts";
import {
  graphAccounts,
  graphStories,
  laterCleoStories,
  seedGraphDatabase,
} from "./seeded-pages.ts";

const shared = useSharedTestRuntime(seedGraphDatabase);
const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime), "/graph");
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const adaAndBen = `Connexion entre ${ada} et ${ben} : 2 stories`;
const adaAndCleo = `Connexion entre ${ada} et ${cleo} : 5 stories`;

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
  return {
    ...mounted,
    region,
    drawing,
    points: within(within(drawing).getByRole("group", { name: "Points" })),
    lines: within(within(drawing).getByRole("group", { name: "Connexions" })),
  };
}

/** The description of a story's image, as its card gives it. */
function altOf(mediaPk: string): string {
  const { stories } = loadMentionGraph(shared.runtime);
  return stories.find((story) => story.mediaPk === mediaPk)?.alt ?? "";
}

function shownStories(evidence: HTMLElement) {
  return within(evidence)
    .getAllByRole("button", { name: /^Ouvrir aperçu/u })
    .map((thumbnail) => thumbnail.dataset.storyPreview);
}

test("a connection opens the stories where one end mentioned the other, each once", async () => {
  const { user, region, lines } = await mountGraph();
  const connection = lines.getByRole("button", { name: adaAndBen });
  await user.click(connection);
  expect(connection).toHaveAttribute("aria-pressed", "true");
  expect(connection).toHaveAttribute("data-highlighted", "true");
  const evidence = region.getByRole("region", {
    name: `Stories de la connexion entre ${ada} et ${ben}`,
  });
  // The first account's story names the second twice; the third's names both, connecting neither.
  expect(shownStories(evidence)).toEqual([graphStories.ben, graphStories.ada]);
  expect(within(evidence).queryByRole("button", { name: "Stories suivantes" })).toBeNull();
});

test("the stories show three at a time, with arrows to the other pages", async () => {
  const { user, region, lines } = await mountGraph();
  await user.click(lines.getByRole("button", { name: adaAndCleo }));
  const evidence = region.getByRole("region", {
    name: `Stories de la connexion entre ${ada} et ${cleo}`,
  });
  const previous = within(evidence).getByRole("button", { name: "Stories précédentes" });
  const next = within(evidence).getByRole("button", { name: "Stories suivantes" });
  expect(shownStories(evidence)).toEqual(laterCleoStories.slice(0, 3));
  expect(within(evidence).getByText("1 / 2")).toBeVisible();
  expect(previous).toBeDisabled();

  await user.click(next);
  // The oldest of the later stories names the first account twice, yet shows once.
  expect(shownStories(evidence)).toEqual([laterCleoStories[3], graphStories.cleo]);
  expect(within(evidence).getByText("2 / 2")).toBeVisible();
  expect(next).toBeDisabled();

  await user.click(previous);
  expect(shownStories(evidence)).toEqual(laterCleoStories.slice(0, 3));
});

test("a thumbnail opens its story in a modal that stays out of the URL", async () => {
  const { user, region, lines, router } = await mountGraph();
  await user.click(lines.getByRole("button", { name: adaAndBen }));
  const evidence = within(
    region.getByRole("region", { name: `Stories de la connexion entre ${ada} et ${ben}` }),
  );
  await user.click(evidence.getByRole("button", { name: `Ouvrir aperçu ${graphStories.ada}` }));

  const modal = within(await screen.findByRole("dialog", { name: "Aperçu de l’image" }));
  expect(modal.getByRole("img", { name: altOf(graphStories.ada) })).toBeVisible();
  expect(router.state.location.href).toBe("/graph");
  // The modal steps through the connection's stories only.
  await user.click(modal.getByRole("button", { name: "Image suivante" }));
  expect(modal.getByRole("img", { name: altOf(graphStories.ben) })).toBeVisible();
  await user.click(modal.getByRole("button", { name: "Image suivante" }));
  expect(modal.getByRole("img", { name: altOf(graphStories.ada) })).toBeVisible();
  expect(router.state.location.href).toBe("/graph");

  await user.click(modal.getByRole("button", { name: "Fermer l’aperçu" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(router.state.location.href).toBe("/graph");
  expect(evidence.getByRole("button", { name: `Ouvrir aperçu ${graphStories.ada}` })).toHaveFocus();
});

test("the stories close with their own control, not with the background", async () => {
  const { user, region, drawing, lines } = await mountGraph();
  const connection = lines.getByRole("button", { name: adaAndBen });
  await user.click(connection);
  await user.click(drawing);
  const evidence = region.getByRole("region", {
    name: `Stories de la connexion entre ${ada} et ${ben}`,
  });
  await user.click(
    within(evidence).getByRole("button", { name: "Fermer les stories de la connexion" }),
  );
  expect(region.queryByRole("region", { name: /^Stories de la connexion/u })).toBeNull();
  expect(connection).toHaveAttribute("aria-pressed", "false");
});

test("selecting another point closes the stories, and points keep their profile", async () => {
  const { user, region, lines, points } = await mountGraph();
  await user.click(points.getByRole("button", { name: ada }));
  await user.click(lines.getByRole("button", { name: adaAndBen }));
  expect(
    region.getByRole("region", { name: `Stories de la connexion entre ${ada} et ${ben}` }),
  ).toBeVisible();
  expect(screen.getByRole("dialog", { name: `Profil de ${ada}` })).toBeVisible();

  const other = points.getByRole("button", { name: ben });
  await user.click(other);
  expect(region.queryByRole("region", { name: /^Stories de la connexion/u })).toBeNull();
  expect(other).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByRole("dialog", { name: `Profil de ${ben}` })).toBeVisible();
});

test("the keyboard opens a connection's stories, and dragging across one only pans", async () => {
  const { user, region, lines, drawing } = await mountGraph();
  const connection = lines.getByRole("button", { name: adaAndCleo });
  fireEvent.pointerDown(connection, { button: 0, pointerId: 5, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(drawing, { pointerId: 5, clientX: 200, clientY: 150 });
  fireEvent.pointerUp(drawing, { pointerId: 5, clientX: 200, clientY: 150 });
  fireEvent.click(connection);
  expect(region.queryByRole("region", { name: /^Stories de la connexion/u })).toBeNull();

  act(() => {
    connection.focus();
  });
  await user.keyboard("{Enter}");
  expect(
    region.getByRole("region", { name: `Stories de la connexion entre ${ada} et ${cleo}` }),
  ).toBeVisible();
});
