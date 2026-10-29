import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { UserSection } from "../../server/components/user-section.tsx";
import { reportProps } from "../page-props.ts";
import { renderContent } from "./render.tsx";

const [section] = reportProps.users;

test("missing display name uses the handle and an unavailable avatar has no broken image", async () => {
  await renderContent(
    <UserSection {...section} user={{ ...section.user, full_name: null }} avatar={undefined} />,
  );
  expect(screen.getByRole("heading", { name: `@${section.user.username}` })).toBeVisible();
  expect(screen.getByRole("link")).toHaveAttribute("href", `/users/${section.user.username}`);
  expect(screen.queryByRole("img", { name: /avatar/u })).not.toBeInTheDocument();
});

test.each([undefined, ""])("an absent summary (%s) is omitted", async (summary) => {
  await renderContent(<UserSection {...section} summary={summary} stories={[]} />);
  expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Ouvrir aperçu/u })).not.toBeInTheDocument();
});

test("a summary remains visible when there are no cached story previews", async () => {
  await renderContent(<UserSection {...section} summary="A visible summary" stories={[]} />);
  expect(screen.getByText("A visible summary")).toBeVisible();
});
