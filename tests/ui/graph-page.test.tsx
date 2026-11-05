import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, expect, test } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { seedPageDatabase, mentionedAccount, namedAccount } from "./seeded-pages.ts";
import { createTestRuntime, useSharedTestRuntime } from "../setup/test-runtime.ts";
import {
  editRecordedStories,
  keepRecordedStories,
  readRecordedPayloads,
  seedRecordedStories,
} from "../setup/seed.ts";

const shared = useSharedTestRuntime(seedPageDatabase);
const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime), "/graph");

beforeAll(() => {
  // jsdom does not implement pointer capture; events still traverse the real SVG and handlers.
  Object.defineProperty(globalThis.Element.prototype, "setPointerCapture", {
    configurable: true,
    value: () => {},
  });
});

test("selecting a known point shows its profile and highlights its connections; the background clears it", async () => {
  const { user } = await renderer.mountRoute("/graph");
  const graph = within(await screen.findByRole("region", { name: "Graphe des mentions" }));
  await user.click(graph.getByRole("button", { name: `@${mentionedAccount}` }));
  const profile = within(
    await screen.findByRole("dialog", { name: `Profil @${mentionedAccount}` }),
  );
  expect(profile.getByRole("link", { name: "Voir le profil" })).toHaveAttribute(
    "href",
    `/users/${mentionedAccount}`,
  );
  expect(
    graph
      .getAllByRole("button", { name: /Connexion/u })
      .some((edge) => edge.getAttribute("aria-pressed") === "true"),
  ).toBe(true);
  await user.click(graph.getByRole("button", { name: "Désélectionner les points" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("known avatars fall back to initials and the graph offers zoom and recenter controls", async () => {
  const { user } = await renderer.mountRoute("/graph");
  const graph = within(await screen.findByRole("region", { name: "Graphe des mentions" }));
  expect(
    within(graph.getByRole("button", { name: `@${namedAccount.username}` })).getByText("US"),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Zoom avant" }));
  expect(graph.getByRole("group", { name: "Points et connexions" })).toHaveAttribute(
    "data-zoom",
    "1.25",
  );
  await user.click(screen.getByRole("button", { name: "Recentrer le graphe" }));
  expect(graph.getByRole("group", { name: "Points et connexions" })).toHaveAttribute(
    "data-zoom",
    "1",
  );
});

test("an unknown point has a hover label, highlights its edges and never opens a profile", async (context) => {
  const runtime = await createTestRuntime(context);
  await seedRecordedStories(
    runtime,
    editRecordedStories(
      keepRecordedStories(await readRecordedPayloads(["instagram-story-data.json"]), [
        "700000000000079",
      ]),
      (story) => {
        story.story_bloks_stickers = [
          { bloks_sticker: { sticker_data: { ig_mention: { username: "unknown_graph" } } } },
        ];
      },
    ),
  );
  const { user } = await renderer.mountRoute("/graph", loadMentionGraph(runtime));
  const graph = within(await screen.findByRole("region", { name: "Graphe des mentions" }));
  const point = graph.getByRole("button", { name: "@unknown_graph" });
  expect(point).toHaveAttribute("title", "@unknown_graph");
  await user.click(point);
  expect(point).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    graph
      .getAllByRole("button", { name: /Connexion/u })
      .some((edge) => edge.getAttribute("aria-pressed") === "true"),
  ).toBe(true);
});

test("dragging a point moves it, release resumes the layout and dragging the background pans", async () => {
  await renderer.mountRoute("/graph");
  const graph = within(await screen.findByRole("region", { name: "Graphe des mentions" }));
  const point = graph.getByRole("button", { name: `@${mentionedAccount}` });
  const viewport = graph.getByLabelText("Zone de déplacement du graphe");
  fireEvent.pointerDown(point, { button: 0, pointerId: 1, clientX: 400, clientY: 300 });
  fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 100, clientY: 100 });
  await waitFor(() => {
    expect(point.parentElement).toHaveAttribute("x", "76");
  });
  fireEvent.pointerUp(viewport, { pointerId: 1 });
  await waitFor(() => {
    expect(point.parentElement).not.toHaveAttribute("x", "76");
  });
  fireEvent.pointerDown(viewport, { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(viewport, { pointerId: 2, clientX: 200, clientY: 150 });
  fireEvent.pointerUp(viewport, { pointerId: 2 });
  expect(graph.getByRole("group", { name: "Points et connexions" })).toHaveAttribute(
    "transform",
    "translate(100 50) scale(1)",
  );
  fireEvent.wheel(viewport, { deltaY: -1 });
  expect(graph.getByRole("group", { name: "Points et connexions" })).toHaveAttribute(
    "data-zoom",
    "1.1",
  );
});
