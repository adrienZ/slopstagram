import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { useSharedTestRuntime } from "../setup/test-runtime.ts";
import { mountGraph as mountGraphWith, stubGraphLayout } from "./mount-graph.ts";
import {
  cleoStoriesMentioningAda,
  cleoStoryMentioningAdaTwice,
  graphAccounts,
  graphStories,
  seedGraphDatabase,
} from "../setup/mention-graph-seed.ts";

const shared = useSharedTestRuntime(seedGraphDatabase);
const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime, []), "/graph");

async function mountGraph() {
  return await mountGraphWith(renderer);
}

const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const adaAndBen = `Connexion entre ${ada} et ${ben} : 2 stories`;
const adaAndCleo = `Connexion entre ${ada} et ${cleo} : 5 stories`;

stubGraphLayout();

function altOf(mediaPk: string): string {
  const { stories } = loadMentionGraph(shared.runtime, []).graph;

  return stories.find((story) => story.mediaPk === mediaPk)?.alt ?? "";
}

function shownStories(panel: HTMLElement) {
  return within(panel)
    .getAllByRole("button", { name: /^Ouvrir aperçu/u })
    .map((thumbnail) => thumbnail.dataset.storyPreview);
}

test("a connection opens the stories where one end mentioned the other, each once", async () => {
  const { user, region, lines } = await mountGraph();
  const connection = lines.getByRole("button", { name: adaAndBen });
  await user.click(connection);
  expect(connection).toHaveAttribute("aria-pressed", "true");
  expect(connection).toHaveAttribute("data-highlighted", "true");

  const panel = region.getByRole("region", {
    name: `Stories de la connexion entre ${ada} et ${ben}`,
  });

  expect(shownStories(panel)).toEqual([graphStories.ben, graphStories.ada]);
  expect(within(panel).queryByRole("button", { name: "Stories suivantes" })).toBeNull();
});

test("the stories show three at a time, with arrows to the other pages", async () => {
  const { user, region, lines } = await mountGraph();
  await user.click(lines.getByRole("button", { name: adaAndCleo }));

  const panel = region.getByRole("region", {
    name: `Stories de la connexion entre ${ada} et ${cleo}`,
  });

  const previous = within(panel).getByRole("button", { name: "Stories précédentes" });
  const next = within(panel).getByRole("button", { name: "Stories suivantes" });
  expect(shownStories(panel)).toEqual(cleoStoriesMentioningAda.slice(0, 3));
  expect(within(panel).getByText("1 / 2")).toBeVisible();
  expect(previous).toBeDisabled();

  await user.click(next);
  expect(shownStories(panel)).toEqual([cleoStoryMentioningAdaTwice, graphStories.cleo]);
  expect(within(panel).getByText("2 / 2")).toBeVisible();
  expect(next).toBeDisabled();

  await user.click(previous);
  expect(shownStories(panel)).toEqual(cleoStoriesMentioningAda.slice(0, 3));
});

test("a thumbnail opens its story in a modal that stays out of the URL", async () => {
  const { user, region, lines, router } = await mountGraph();
  await user.click(lines.getByRole("button", { name: adaAndBen }));

  const panel = within(
    region.getByRole("region", { name: `Stories de la connexion entre ${ada} et ${ben}` }),
  );

  await user.click(panel.getByRole("button", { name: `Ouvrir aperçu ${graphStories.ada}` }));

  const modal = within(await screen.findByRole("dialog", { name: "Aperçu de l’image" }));
  expect(modal.getByRole("img", { name: altOf(graphStories.ada) })).toBeVisible();
  expect(router.state.location.href).toBe("/graph");

  await user.click(modal.getByRole("button", { name: "Fermer l’aperçu" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(router.state.location.href).toBe("/graph");
  expect(panel.getByRole("button", { name: `Ouvrir aperçu ${graphStories.ada}` })).toHaveFocus();
});

test("the modal steps and counts through the connection's stories only", async () => {
  const { user, region, lines } = await mountGraph();
  await user.click(lines.getByRole("button", { name: adaAndBen }));

  const panel = within(
    region.getByRole("region", { name: `Stories de la connexion entre ${ada} et ${ben}` }),
  );

  await user.click(panel.getByRole("button", { name: `Ouvrir aperçu ${graphStories.ada}` }));

  const modal = within(await screen.findByRole("dialog", { name: "Aperçu de l’image" }));
  expect(modal.getByText("2 / 2")).toBeVisible();
  await user.click(modal.getByRole("button", { name: "Image suivante" }));
  expect(modal.getByRole("img", { name: altOf(graphStories.ben) })).toBeVisible();
  expect(modal.getByText("1 / 2")).toBeVisible();
  await user.click(modal.getByRole("button", { name: "Image suivante" }));
  expect(modal.getByRole("img", { name: altOf(graphStories.ada) })).toBeVisible();
});

test("the stories close with their own control, not with the background", async () => {
  const { user, region, drawing, lines } = await mountGraph();
  const connection = lines.getByRole("button", { name: adaAndBen });
  await user.click(connection);
  await user.click(drawing);

  const panel = region.getByRole("region", {
    name: `Stories de la connexion entre ${ada} et ${ben}`,
  });

  await user.click(
    within(panel).getByRole("button", { name: "Fermer les stories de la connexion" }),
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

test("opening a story keeps the selected point and its profile", async () => {
  const { user, region, lines, points } = await mountGraph();
  const point = points.getByRole("button", { name: ada });
  await user.click(point);
  await user.click(lines.getByRole("button", { name: adaAndBen }));

  const panel = within(
    region.getByRole("region", { name: `Stories de la connexion entre ${ada} et ${ben}` }),
  );

  await user.click(panel.getByRole("button", { name: `Ouvrir aperçu ${graphStories.ada}` }));
  const modal = within(await screen.findByRole("dialog", { name: "Aperçu de l’image" }));
  await user.click(modal.getByRole("button", { name: "Fermer l’aperçu" }));

  expect(point).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("dialog", { name: `Profil de ${ada}` })).toBeVisible();
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
