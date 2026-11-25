import { screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { shareTestRuntime } from "../setup/test-runtime.ts";
import {
  ambiguousUsername,
  filterAccount,
  graphAccounts,
  graphStories,
  lonelyAccount,
  seedFilterGraphDatabase,
  sharedUsername,
} from "../setup/mention-graph-seed.ts";
import { GraphWrapper } from "./mount-graph.ts";

const shared = shareTestRuntime(seedFilterGraphDatabase);

const renderer = createPageRenderer(
  Route,
  ({ deps }) => loadMentionGraph(shared.runtime, deps.accounts),
  "/graph",
);

const [adaGraph, benGraph, cleoGraph] = graphAccounts;
const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const eve = `@${filterAccount}`;
const twin = `@${sharedUsername}`;
const everyConnectionCount = 11;

async function mountGraph(url = "/graph") {
  const mounted = await renderer.mountRoute(url, undefined, { wrapper: GraphWrapper });
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
  expect(shownPoints()).toStrictEqual([cleo, ada, ben]);
  expect(shownConnections()).toStrictEqual([
    `Connexion entre ${ada} et ${cleo} : 5 stories`,
    `Connexion entre ${ben} et ${cleo} : 1 story`,
    `Connexion entre ${ada} et ${ben} : 2 stories`,
  ]);
  expect(checkedAccounts(await openFilters(user))).toStrictEqual([ben]);
});

test("an account in the URL is matched ignoring case, as mention stickers are", async () => {
  const { user } = await mountGraph(`/graph?accounts=${benGraph.toUpperCase()}`);
  expect(shownPoints()).toStrictEqual([cleo, ada, ben]);
  expect(screen.queryByText(/^Compte absent du graphe/u)).not.toBeInTheDocument();
  expect(checkedAccounts(await openFilters(user))).toStrictEqual([ben]);
});

test("several accounts show the union of their neighborhoods and every link among its points", async () => {
  await mountGraph(`/graph?accounts=${benGraph},${filterAccount}`);
  expect(shownPoints()).toStrictEqual([cleo, eve, ada, ben]);
  expect(shownConnections()).toStrictEqual([
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
  expect(
    filters.getAllByRole("checkbox").map((box) => box.getAttribute("aria-label")),
  ).toStrictEqual([ada, ben, cleo, eve, twin]);

  await user.click(filters.getByRole("checkbox", { name: eve }));
  await waitFor(() => {
    expect(shownPoints()).toStrictEqual([cleo, eve]);
  });
  expect({ ...router.state.location.search }).toStrictEqual({ accounts: filterAccount });

  await user.click(filters.getByRole("checkbox", { name: ben }));
  await waitFor(() => {
    expect(shownConnections()).toHaveLength(4);
  });
  expect({ ...router.state.location.search }).toStrictEqual({
    accounts: `${filterAccount},${benGraph}`,
  });
  expect(checkedAccounts(filters)).toStrictEqual([ben, eve]);

  await user.click(filters.getByRole("checkbox", { name: eve }));
  await waitFor(() => {
    expect(shownPoints()).toStrictEqual([cleo, ada, ben]);
  });
  expect({ ...router.state.location.search }).toStrictEqual({ accounts: benGraph });

  await user.click(filters.getByRole("button", { name: "Effacer les filtres" }));
  await waitFor(() => {
    expect(shownConnections()).toHaveLength(everyConnectionCount);
  });
  expect({ ...router.state.location.search }).toStrictEqual({});
  expect(checkedAccounts(filters)).toStrictEqual([]);
});

test.each([
  ["an unknown username", "nobody_graph"],
  ["an Account without any connection", lonelyAccount],
  ["a username only Accounts without a connection share", ambiguousUsername],
])(
  "%s in the URL skips every filter with an error toast, until a filter is chosen",
  async (_case, username) => {
    const { user } = await mountGraph(`/graph?accounts=${benGraph},${username}`);

    const notice = await screen.findByText(
      `Compte absent du graphe : @${username}. Le graphe complet est affiché.`,
    );

    expect(notice).toBeVisible();
    expect(shownConnections()).toHaveLength(everyConnectionCount);
    const filters = await openFilters(user);
    expect(checkedAccounts(filters)).toStrictEqual([]);

    await user.click(filters.getByRole("checkbox", { name: cleo }));
    await waitFor(() => {
      expect(screen.queryByText(/^Compte absent du graphe/u)).not.toBeInTheDocument();
    });
  },
);

test("an account filter whose username two drawn Accounts share shows both of them", async () => {
  const { user } = await mountGraph(`/graph?accounts=${sharedUsername}`);
  expect(
    shownPoints().toSorted((left, right) => String(left).localeCompare(String(right))),
  ).toStrictEqual([cleo, twin, twin]);
  expect(shownConnections()).toHaveLength(2);
  expect(checkedAccounts(await openFilters(user))).toStrictEqual([twin]);
});

test("filters the graph skipped can still be cleared, which removes them from the URL", async () => {
  const { user, router } = await mountGraph(`/graph?accounts=${benGraph},nobody_graph`);
  await screen.findByText(/^Compte absent du graphe/u);
  const filters = await openFilters(user);

  await user.click(filters.getByRole("button", { name: "Effacer les filtres" }));
  await waitFor(() => {
    expect({ ...router.state.location.search }).toStrictEqual({});
  });
  await waitFor(() => {
    expect(screen.queryByText(/^Compte absent du graphe/u)).not.toBeInTheDocument();
  });
  expect(filters.getByRole("button", { name: "Effacer les filtres" })).toBeDisabled();
});

test("the toast names every username the graph lacks", async () => {
  await mountGraph(`/graph?accounts=nobody_graph,${adaGraph},${lonelyAccount}`);

  const notice = await screen.findByText(
    `Comptes absents du graphe : @nobody_graph, @${lonelyAccount}. Le graphe complet est affiché.`,
  );

  expect(notice).toBeVisible();
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
  const preview = await screen.findByRole("dialog", { name: "Aperçu de l’image" });
  expect(preview).toBeVisible();
  expect(router.state.location.href).toBe(href);
  await user.click(screen.getByRole("button", { name: "Fermer l’aperçu" }));

  const filters = await openFilters(user);
  await user.click(filters.getByRole("checkbox", { name: cleo }));
  await waitFor(() => {
    expect({ ...router.state.location.search }).toStrictEqual({
      accounts: `${benGraph},${cleoGraph}`,
    });
  });
  await waitFor(() => {
    expect(shownPoints()).toContain(eve);
  });
  expect(screen.queryByRole("region", { name: /^Stories de la connexion/u })).toBeNull();
  expect(
    drawing()
      .points.getAllByRole("button")
      .filter((point) => point.getAttribute("aria-pressed") === "true"),
  ).toStrictEqual([]);
});
