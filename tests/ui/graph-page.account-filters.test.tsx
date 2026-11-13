import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { useSharedTestRuntime } from "../setup/test-runtime.ts";
import {
  ambiguousUsername,
  filterAccount,
  graphAccounts,
  graphStories,
  lonelyAccount,
  seedFilterGraphDatabase,
} from "./seeded-pages.ts";

const shared = useSharedTestRuntime(seedFilterGraphDatabase);
const renderer = createPageRenderer(
  Route,
  ({ deps }) => loadMentionGraph(shared.runtime, deps.accounts),
  "/graph",
);
const [adaGraph, benGraph, cleoGraph] = graphAccounts;
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const eve = `@${filterAccount}`;
const everyConnectionCount = 9;

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

async function mountGraph(url = "/graph") {
  const mounted = await renderer.mountRoute(url);
  await screen.findByRole("region", { name: "Graphe des mentions" });
  return mounted;
}

/** The graph's current drawing: it is drawn again whenever the filters change. */
function drawing() {
  const region = within(screen.getByRole("region", { name: "Graphe des mentions" }));
  const canvas = within(region.getByRole("group", { name: "Points et connexions" }));
  return {
    points: within(canvas.getByRole("group", { name: "Points" })),
    lines: within(canvas.getByRole("group", { name: "Connexions" })),
  };
}

function shownPoints(): Array<string | null> {
  return drawing()
    .points.getAllByRole("button")
    .map((point) => point.getAttribute("aria-label"));
}

function shownConnections(): Array<string | null> {
  return drawing()
    .lines.getAllByRole("button")
    .map((connection) => connection.getAttribute("aria-label"));
}

async function openFilters(user: Awaited<ReturnType<typeof mountGraph>>["user"]) {
  await user.click(screen.getByRole("button", { name: /^Filtrer par compte/u }));
  return within(await screen.findByRole("dialog", { name: "Filtres affichés" }));
}

function checkedAccounts(filters: Awaited<ReturnType<typeof openFilters>>): Array<string | null> {
  return filters
    .getAllByRole("checkbox")
    .filter((checkbox) => checkbox.getAttribute("aria-checked") === "true")
    .map((checkbox) => checkbox.getAttribute("aria-label"));
}

test("an account in the URL opens its neighborhood, with the links among its neighbors", async () => {
  const { user } = await mountGraph(`/graph?accounts=${benGraph}`);
  expect(shownPoints()).toEqual([cleo, ada, ben]);
  expect(shownConnections()).toEqual([
    `Connexion entre ${ada} et ${cleo} : 5 stories`,
    `Connexion entre ${ben} et ${cleo} : 1 story`,
    `Connexion entre ${ada} et ${ben} : 2 stories`,
  ]);
  expect(checkedAccounts(await openFilters(user))).toEqual([ben]);
});

test("several accounts show the union of their neighborhoods and every link among its points", async () => {
  await mountGraph(`/graph?accounts=${benGraph},${filterAccount}`);
  expect(shownPoints()).toEqual([cleo, eve, ada, ben]);
  expect(shownConnections()).toEqual([
    `Connexion entre ${cleo} et ${eve} : 1 story`,
    `Connexion entre ${ada} et ${cleo} : 5 stories`,
    `Connexion entre ${ben} et ${cleo} : 1 story`,
    `Connexion entre ${ada} et ${ben} : 2 stories`,
  ]);
});

test("the filters on the left add and remove accounts in the URL, and clearing shows everything", async () => {
  const { user, router } = await mountGraph();
  expect(shownConnections()).toHaveLength(everyConnectionCount);
  const filters = await openFilters(user);
  // Only the Accounts the graph draws can be chosen.
  expect(filters.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
    ada,
    ben,
    cleo,
    eve,
  ]);

  await user.click(filters.getByRole("checkbox", { name: eve }));
  await waitFor(() => {
    expect(shownPoints()).toEqual([cleo, eve]);
  });
  expect(router.state.location.search).toEqual({ accounts: filterAccount });

  await user.click(filters.getByRole("checkbox", { name: ben }));
  await waitFor(() => {
    expect(shownConnections()).toHaveLength(4);
  });
  expect(router.state.location.search).toEqual({ accounts: `${filterAccount},${benGraph}` });
  expect(checkedAccounts(filters)).toEqual([ben, eve]);

  await user.click(filters.getByRole("checkbox", { name: eve }));
  await waitFor(() => {
    expect(shownPoints()).toEqual([cleo, ada, ben]);
  });
  expect(router.state.location.search).toEqual({ accounts: benGraph });

  await user.click(filters.getByRole("button", { name: "Effacer les filtres" }));
  await waitFor(() => {
    expect(shownConnections()).toHaveLength(everyConnectionCount);
  });
  expect(router.state.location.search).toEqual({});
  expect(checkedAccounts(filters)).toEqual([]);
});

test.each([
  ["an unknown username", "nobody_graph"],
  ["an Account without any connection", lonelyAccount],
  ["a username several Accounts share", ambiguousUsername],
])(
  "%s in the URL skips every filter with an error toast, until a filter is chosen",
  async (_case, username) => {
    const { user } = await mountGraph(`/graph?accounts=${benGraph},${username}`);
    expect(
      await screen.findByText(
        `Compte absent du graphe : @${username}. Le graphe complet est affiché.`,
      ),
    ).toBeVisible();
    expect(shownConnections()).toHaveLength(everyConnectionCount);
    const filters = await openFilters(user);
    expect(checkedAccounts(filters)).toEqual([]);

    await user.click(filters.getByRole("checkbox", { name: cleo }));
    await waitFor(() => {
      expect(screen.queryByText(/^Compte absent du graphe/u)).not.toBeInTheDocument();
    });
  },
);

test("the toast names every username the graph lacks", async () => {
  await mountGraph(`/graph?accounts=nobody_graph,${adaGraph},${lonelyAccount}`);
  expect(
    await screen.findByText(
      `Comptes absents du graphe : @nobody_graph, @${lonelyAccount}. Le graphe complet est affiché.`,
    ),
  ).toBeVisible();
});

test("a filtered graph keeps its selection and story modal out of the URL, and a new filter clears them", async () => {
  const { user, router } = await mountGraph(`/graph?accounts=${benGraph}`);
  const { href } = router.state.location;
  await user.click(drawing().points.getByRole("button", { name: ada }));
  await user.click(
    drawing().lines.getByRole("button", { name: `Connexion entre ${ada} et ${ben} : 2 stories` }),
  );
  const evidence = within(
    screen.getByRole("region", { name: `Stories de la connexion entre ${ada} et ${ben}` }),
  );
  await user.click(evidence.getByRole("button", { name: `Ouvrir aperçu ${graphStories.ada}` }));
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
  expect(router.state.location.href).toBe(href);
  await user.click(screen.getByRole("button", { name: "Fermer l’aperçu" }));

  const filters = await openFilters(user);
  await user.click(filters.getByRole("checkbox", { name: cleo }));
  await waitFor(() => {
    expect(router.state.location.search).toEqual({ accounts: `${benGraph},${cleoGraph}` });
  });
  await waitFor(() => {
    expect(shownPoints()).toContain(eve);
  });
  expect(screen.queryByRole("region", { name: /^Stories de la connexion/u })).toBeNull();
  expect(
    drawing()
      .points.getAllByRole("button")
      .filter((point) => point.getAttribute("aria-pressed") === "true"),
  ).toEqual([]);
});
