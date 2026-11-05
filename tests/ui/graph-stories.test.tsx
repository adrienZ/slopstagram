import { screen, within } from "@testing-library/react";
import { beforeAll, expect, test } from "vitest";
import { Route } from "../../app/routes/graph.tsx";
import { loadMentionGraph } from "../../app/loaders/mention-graph.ts";
import { createPageRenderer } from "../render-page.ts";
import { useSharedTestRuntime } from "../setup/test-runtime.ts";
import {
  editRecordedStories,
  editRecordedUsers,
  keepRecordedStories,
  readRecordedPayloads,
  seedRecordedStories,
} from "../setup/seed.ts";

const shared = useSharedTestRuntime(async (runtime) => {
  const recorded = editRecordedUsers(
    await readRecordedPayloads(["instagram-story-data.json"]),
    (user, position) => {
      user.username = ["ada_evidence", "ben_evidence", "cleo_evidence"][position] ?? user.username;
    },
  );
  await seedRecordedStories(
    runtime,
    editRecordedStories(
      keepRecordedStories(recorded, [
        "700000000000079",
        "700000000000090",
        "700000000000100",
        "700000000000107",
        "700000000000116",
        "700000000000122",
      ]),
      (story) => {
        let usernames = ["ben_evidence", "BEN_EVIDENCE"];
        if (story.pk === "700000000000079") {
          usernames = ["ben_evidence", "cleo_evidence"];
        } else if (story.pk === "700000000000090") {
          usernames = ["cleo_evidence"];
        }
        story.story_bloks_stickers = usernames.map((username) => ({
          bloks_sticker: { sticker_data: { ig_mention: { username } } },
        }));
      },
    ),
  );
});
const renderer = createPageRenderer(Route, () => loadMentionGraph(shared.runtime), "/graph");
const connectionName = "Connexion @ben_evidence et @cleo_evidence : 5 stories";

beforeAll(() => {
  Object.defineProperty(globalThis.Element.prototype, "setPointerCapture", {
    configurable: true,
    value: () => {},
  });
});

test("a connection shows deduplicated stories in pages of three and opens a transient modal", async () => {
  const { user, router, unmount } = await renderer.mountRoute("/graph");
  const graph = within(await screen.findByRole("region", { name: "Graphe des mentions" }));
  await user.click(graph.getByRole("button", { name: "@ben_evidence" }));
  await user.click(graph.getByRole("button", { name: connectionName }));
  const evidence = within(await screen.findByRole("dialog", { name: "Stories de la connexion" }));
  const firstPage = evidence.getAllByRole("button", { name: /Ouvrir aperçu/u });
  expect(firstPage).toHaveLength(3);
  expect(evidence.getByRole("button", { name: "Stories précédentes" })).toBeDisabled();
  expect(screen.getByRole("dialog", { name: "Profil @ben_evidence" })).toBeVisible();
  await user.click(evidence.getByRole("button", { name: "Stories suivantes" }));
  const lastPage = evidence.getAllByRole("button", { name: /Ouvrir aperçu/u });
  expect(lastPage).toHaveLength(2);
  expect(lastPage.map((button) => button.dataset.storyPreview)).toContain("700000000000090");
  expect(lastPage.map((button) => button.dataset.storyPreview)).not.toContain("700000000000079");
  expect(evidence.getByRole("button", { name: "Stories suivantes" })).toBeDisabled();
  await user.click(lastPage[0]);
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
  expect(router.state.location.search).toEqual({});
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Aperçu de l’image" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Stories de la connexion" })).toBeVisible();
  await user.click(evidence.getByRole("button", { name: "Stories précédentes" }));
  expect(evidence.getAllByRole("button", { name: /Ouvrir aperçu/u })).toHaveLength(3);
  await user.click(evidence.getAllByRole("button", { name: /Ouvrir aperçu/u })[0]);
  expect(await screen.findByRole("dialog", { name: "Aperçu de l’image" })).toBeVisible();
  unmount();
  await renderer.mountRoute("/graph");
  expect(screen.queryByRole("dialog", { name: "Aperçu de l’image" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Stories de la connexion" })).not.toBeInTheDocument();
});

test("evidence closes independently and another point clears it while preserving profile selection", async () => {
  const { user } = await renderer.mountRoute("/graph");
  const graph = within(await screen.findByRole("region", { name: "Graphe des mentions" }));
  await user.click(graph.getByRole("button", { name: "@ben_evidence" }));
  await user.click(graph.getByRole("button", { name: connectionName }));
  await user.click(screen.getByRole("button", { name: "Fermer les stories de la connexion" }));
  expect(screen.queryByRole("dialog", { name: "Stories de la connexion" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Profil @ben_evidence" })).toBeVisible();
  await user.click(graph.getByRole("button", { name: connectionName }));
  await user.click(graph.getByRole("button", { name: "@cleo_evidence" }));
  expect(screen.queryByRole("dialog", { name: "Stories de la connexion" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Profil @cleo_evidence" })).toBeVisible();
  await user.click(graph.getByRole("button", { name: connectionName }));
  await user.click(graph.getByRole("button", { name: "Désélectionner les points" }));
  expect(screen.queryByRole("dialog", { name: "Profil @cleo_evidence" })).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Stories de la connexion" })).toBeVisible();
  expect(graph.getByRole("button", { name: connectionName })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
