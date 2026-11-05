import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMarkdown } from "../../app/components/chat-markdown.tsx";

const accounts = [{ username: "user_072", avatarPath: "/media/avatars/1.jpg" }];
const places = [{ id: "place-1", name: "Synthetic Cafe" }];

function renderMarkdown(markdown: string) {
  return render(
    <ChatMarkdown accounts={accounts} places={places}>
      {markdown}
    </ChatMarkdown>,
  );
}

test("a place: link opens the place on the map in the same tab", () => {
  renderMarkdown("Go to [the cafe](place:place-1).");

  const link = screen.getByRole("link", { name: "the cafe" });
  expect(link).toHaveAttribute("href", "/map?place=place-1");
  expect(link).not.toHaveAttribute("target");
});

test("a user: link and an @mention of an account are stickers of the story feed", () => {
  renderMarkdown("See [@user_072](user:user_072) and @user_072, not @user_999.");

  const stickers = screen.getAllByRole("link", { name: "@user_072" });
  expect(stickers).toHaveLength(2);
  for (const sticker of stickers) {
    expect(sticker).toHaveAttribute("href", "/users/user_072");
  }
  expect(screen.queryByRole("link", { name: "@user_999" })).not.toBeInTheDocument();
});

test("a profile path written as a link is an ordinary link, not a sticker", () => {
  renderMarkdown("[profile](/users/user_072)");

  const link = screen.getByRole("link", { name: "profile" });
  expect(link.querySelector("img")).toBeNull();
  expect(link).toHaveAttribute("target", "_blank");
});

test("the names of the places the Assistant read are linked where it forgot to link them", () => {
  renderMarkdown("I liked Synthetic Cafe a lot.");

  expect(screen.getByRole("link", { name: "Synthetic Cafe" })).toHaveAttribute(
    "href",
    "/map?place=place-1",
  );
});

test("unknown schemes are dropped, other links open in a new tab and raw HTML is not rendered", () => {
  const { container } = renderMarkdown(
    "[bad](javascript:alert(1)) [odd](custom:thing) [ok](https://example.com) <b>raw</b>",
  );

  expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute("target", "_blank");
  // The anchors stay, without a target to follow.
  for (const text of ["bad", "odd"]) {
    expect(screen.getByText(text)).toHaveAttribute("href", "");
  }
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(container.querySelector("b")).toBeNull();
});
