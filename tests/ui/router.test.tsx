import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { getRouter, routerOptions } from "../../server/router.tsx";

test("an unknown URL renders the not-found page of the application router", async () => {
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: ["/no-such-page"] }) });
  await router.load();
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("heading", { name: "404 : Page introuvable" })).toBeVisible();
});

test("the default error component renders the internal error page", () => {
  render(<routerOptions.defaultErrorComponent />);
  expect(screen.getByRole("heading", { name: "500 : Erreur interne" })).toBeVisible();
});
