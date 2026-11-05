import { screen, within } from "@testing-library/react";
import { beforeAll, expect, test } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { createPageRenderer } from "../render-page.ts";
import { createTestRuntime, useSharedTestRuntime } from "../setup/test-runtime.ts";

const usernames = [
  "ada_graph_filter",
  "ben_graph_filter",
  "cleo_graph_filter",
  "drew_graph_filter",
  "eli_graph_filter",
  "faye_graph_filter",
  "isolated_graph_filter",
];
const [ada, ben, cleo, drew, eli, faye, isolated] = usernames;

async function seedFilterGraph(runtime: Runtime) {
  // The recordings lack this topology: seed through real repositories on the migrated database.
  await Promise.all(
    usernames.map(async (username, index) => {
      const pk = `filter-account-${index}`;
      await runtime.users.save({ pk, id: pk, username, full_name: `Fixture person ${index}` });
    }),
  );
  const edges = [
    { ownerIndex: 0, targets: [ben, cleo, "visitor_graph_filter"] },
    { ownerIndex: 1, targets: [cleo, drew] },
    { ownerIndex: 2, targets: [drew, faye] },
    { ownerIndex: 4, targets: [faye] },
  ];
  await Promise.all(
    edges.map(async ({ ownerIndex, targets }) => {
      await runtime.stories.save(
        {
          pk: `filter-story-${ownerIndex}`,
          taken_at: 100 + ownerIndex,
          annotations: {
            locations: [],
            stickers: targets.map((username) => ({ kind: "mention", label: `@${username}` })),
          },
        },
        { pk: `filter-account-${ownerIndex}`, username: usernames[ownerIndex] },
      );
    }),
  );
}

const shared = useSharedTestRuntime(seedFilterGraph);
const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime), "/graph");

beforeAll(() => {
  Object.defineProperty(globalThis.Element.prototype, "setPointerCapture", {
    configurable: true,
    value: () => {},
  });
});

async function mountGraph(url = "/graph") {
  const mounted = await renderer.mountRoute(url);
  return {
    ...mounted,
    graph: within(await screen.findByRole("region", { name: "Graphe des mentions" })),
  };
}

test("a URL account filter shows its neighborhood and all links among its neighbors", async () => {
  const { graph } = await mountGraph(`/graph?accounts=${ada.toUpperCase()}`);
  expect(graph.getByRole("button", { name: `@${ada}` })).toBeVisible();
  expect(graph.getByRole("button", { name: `@${ben}` })).toBeVisible();
  expect(graph.getByRole("button", { name: `@${cleo}` })).toBeVisible();
  expect(graph.getByRole("button", { name: "@visitor_graph_filter" })).toBeVisible();
  expect(graph.queryByRole("button", { name: `@${drew}` })).not.toBeInTheDocument();
  expect(graph.queryByRole("button", { name: `@${eli}` })).not.toBeInTheDocument();
  expect(
    graph.getByRole("button", { name: `Connexion @${ben} et @${cleo} : 1 stories` }),
  ).toBeVisible();
  expect(graph.getAllByRole("button", { name: /Connexion/u })).toHaveLength(4);
});

test("multiple account filters keep the union and links connecting their neighborhoods", async () => {
  const { graph } = await mountGraph(`/graph?accounts=${ada},${eli}`);
  expect(graph.getByRole("button", { name: `@${eli}` })).toBeVisible();
  expect(graph.getByRole("button", { name: `@${faye}` })).toBeVisible();
  expect(graph.queryByRole("button", { name: `@${drew}` })).not.toBeInTheDocument();
  expect(
    graph.getByRole("button", { name: `Connexion @${cleo} et @${faye} : 1 stories` }),
  ).toBeVisible();
  expect(graph.getAllByRole("button", { name: /Connexion/u })).toHaveLength(6);
});

test("the left overlay selects and removes accounts in the URL and clearing restores the graph", async () => {
  const { graph, user, router } = await mountGraph();
  await user.click(screen.getByRole("button", { name: "Filtrer par compte" }));
  const filters = within(await screen.findByRole("dialog", { name: "Filtres affichés" }));
  expect(filters.getAllByRole("checkbox")).toHaveLength(7);
  await user.click(filters.getByRole("checkbox", { name: `@${ada}` }));
  expect(router.state.location.search).toEqual({ accounts: ada });
  expect(graph.queryByRole("button", { name: `@${drew}` })).not.toBeInTheDocument();
  await user.click(filters.getByRole("checkbox", { name: `@${eli}` }));
  expect(router.state.location.search).toEqual({ accounts: `${ada},${eli}` });
  expect(graph.getByRole("button", { name: `@${faye}` })).toBeVisible();
  await user.click(filters.getByRole("checkbox", { name: `@${ada}` }));
  expect(router.state.location.search).toEqual({ accounts: eli });
  expect(graph.queryByRole("button", { name: `@${ada}` })).not.toBeInTheDocument();
  await user.click(filters.getByRole("button", { name: "Effacer les filtres" }));
  expect(router.state.location.search).toEqual({});
  expect(graph.getByRole("button", { name: `@${drew}` })).toBeVisible();
  expect(graph.getAllByRole("button", { name: /Connexion/u })).toHaveLength(8);
});

test("any unknown URL account skips the entire filter and shows an error toast", async () => {
  const { graph, user } = await mountGraph(`/graph?accounts=${ada},missing_graph_filter`);
  expect(graph.getByRole("button", { name: `@${drew}` })).toBeVisible();
  expect(graph.getByRole("button", { name: `@${eli}` })).toBeVisible();
  expect(
    await screen.findByText("Compte inconnu ou ambigu : le graphe complet est affiché."),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Filtrer par compte" }));
  const filters = within(await screen.findByRole("dialog", { name: "Filtres affichés" }));
  expect(
    filters.getAllByRole("checkbox").every((checkbox) => checkbox.dataset.state === "unchecked"),
  ).toBe(true);
});

test("a known isolated account is a valid filter and shows an empty graph", async () => {
  await renderer.mountRoute(`/graph?accounts=${isolated}`);
  expect(await screen.findByText("Aucune connexion à afficher.")).toBeVisible();
  expect(
    screen.queryByText("Compte inconnu ou ambigu : le graphe complet est affiché."),
  ).not.toBeInTheDocument();
});

test("a filtered-out selection does not reopen after clearing filters and transient state stays out of the URL", async () => {
  const { graph, user, router } = await mountGraph();
  await user.click(graph.getByRole("button", { name: `@${drew}` }));
  expect(await screen.findByRole("dialog", { name: `Profil @${drew}` })).toBeVisible();
  expect(router.state.location.search).toEqual({});
  await user.click(screen.getByRole("button", { name: "Filtrer par compte" }));
  const filters = within(await screen.findByRole("dialog", { name: "Filtres affichés" }));
  await user.click(filters.getByRole("checkbox", { name: `@${ada}` }));
  expect(screen.queryByRole("dialog", { name: `Profil @${drew}` })).not.toBeInTheDocument();
  await user.click(filters.getByRole("button", { name: "Effacer les filtres" }));
  expect(graph.getByRole("button", { name: `@${drew}` })).toBeVisible();
  expect(screen.queryByRole("dialog", { name: `Profil @${drew}` })).not.toBeInTheDocument();
});

test("a username matching multiple known accounts skips filtering instead of choosing one", async (context) => {
  const runtime = await createTestRuntime(context);
  await seedFilterGraph(runtime);
  await runtime.users.save({
    pk: "filter-collision",
    id: "filter-collision",
    username: ada.toUpperCase(),
    full_name: "Fixture collision",
  });
  await renderer.mountRoute(`/graph?accounts=${ada}`, loadMentionGraph(runtime));
  expect(
    await screen.findByText("Compte inconnu ou ambigu : le graphe complet est affiché."),
  ).toBeVisible();
  const graph = within(screen.getByRole("region", { name: "Graphe des mentions" }));
  expect(graph.getByRole("button", { name: `@${eli}` })).toBeVisible();
});
