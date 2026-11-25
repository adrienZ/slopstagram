import { act, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { createTestRuntime, shareTestRuntime } from "../setup/test-runtime.ts";
import {
  ambiguousUsername,
  graphAccountFullName,
  graphAccounts,
  lonelyAccount,
  mentionedName,
  seedGraphDatabase,
  unknownUsername,
} from "../setup/mention-graph-seed.ts";
import { mountGraph as mountGraphWith } from "./mount-graph.ts";

const shared = shareTestRuntime(seedGraphDatabase);
const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime, []), "/graph");

async function mountGraph() {
  return await mountGraphWith(renderer);
}

const [ada, ben, cleo] = graphAccounts.map((username) => `@${username}`);
const unknown = `@${unknownUsername}`;

function highlightedConnections(drawing: HTMLElement) {
  return within(within(drawing).getByRole("group", { name: "Connexions" }))
    .getAllByRole("button")
    .filter((connection) => connection.dataset.highlighted === "true")
    .map((connection) => connection.getAttribute("aria-label"));
}

test("every connected Account and mentioned person is a point, unconnected Accounts are not", async () => {
  const { canvas, points } = await mountGraph();
  expect(
    points.getAllByRole("button").map((point) => point.getAttribute("aria-label")),
  ).toStrictEqual([
    cleo,
    ada,
    ben,
    unknown,
    mentionedName,
    `@${ambiguousUsername} (plusieurs comptes)`,
    mentionedName,
  ]);
  expect(canvas.queryByRole("button", { name: `@${lonelyAccount}` })).not.toBeInTheDocument();
});

test("one connection per pair, named with its count of source stories", async () => {
  const { lines } = await mountGraph();
  expect(lines.getAllByRole("button")).toHaveLength(8);
  expect(
    lines.getByRole("button", { name: `Connexion entre ${ada} et ${cleo} : 5 stories` }),
  ).toBeInTheDocument();
  expect(
    lines.getByRole("button", { name: `Connexion entre ${ben} et ${cleo} : 1 story` }),
  ).toBeInTheDocument();
});

test("a known Account opens its profile and highlights its connections", async () => {
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
  expect(highlightedConnections(drawing)).toStrictEqual([
    `Connexion entre ${ada} et ${cleo} : 5 stories`,
    `Connexion entre ${ada} et ${ben} : 2 stories`,
    `Connexion entre ${ada} et ${unknown} : 1 story`,
    `Connexion entre ${ada} et ${mentionedName} : 1 story`,
  ]);
});

test("Escape closes the profile and clears the selection", async () => {
  const { user, canvas, drawing } = await mountGraph();
  await user.click(canvas.getByRole("button", { name: cleo }));
  const profile = await screen.findByRole("dialog", { name: `Profil de ${cleo}` });
  expect(profile).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(highlightedConnections(drawing)).toStrictEqual([]);
});

test("an unknown point highlights its connections without a profile", async () => {
  const { user, canvas, drawing } = await mountGraph();
  await user.click(canvas.getByRole("button", { name: ada }));
  const profile = await screen.findByRole("dialog", { name: `Profil de ${ada}` });
  expect(profile).toBeVisible();

  const point = canvas.getByRole("button", { name: unknown });
  await user.click(point);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(point).toHaveAttribute("aria-pressed", "true");
  expect(highlightedConnections(drawing)).toStrictEqual([
    `Connexion entre ${cleo} et ${unknown} : 1 story`,
    `Connexion entre ${ada} et ${unknown} : 1 story`,
  ]);
});

test("the keyboard selects a point, and Escape clears the selection", async () => {
  const { user, canvas, drawing } = await mountGraph();
  const point = canvas.getByRole("button", { name: unknown });
  act(() => {
    point.focus();
  });
  await user.keyboard("{Enter}");
  expect(point).toHaveAttribute("aria-pressed", "true");
  expect(highlightedConnections(drawing)).toHaveLength(2);
  await user.keyboard("{Escape}");
  expect(point).toHaveAttribute("aria-pressed", "false");
  expect(highlightedConnections(drawing)).toStrictEqual([]);
});

test("without any mention connection the page says so", async (context) => {
  const empty = loadMentionGraph(await createTestRuntime(context), []);
  await renderer.mountRoute("/graph", empty);
  expect(screen.getByText("Aucune mention à afficher")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Graphe des mentions" })).not.toBeInTheDocument();
});
