import type { BrowserContext, Page } from "playwright";
import { expect, test } from "vitest";
import { openInstagramSession } from "@@/core/domains/instagram/playwright-session.ts";

/** A browser whose page loads or fails as told, and that counts how often it is closed. */
function fakeBrowser(goto: Page["goto"]) {
  let closeCount = 0;
  // SAFETY: openInstagramSession only calls `goto` on the page.
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion
  const page = { goto } as Page;
  // SAFETY: openInstagramSession only calls `pages` and `close` on the context.
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion
  const context = {
    close: async () => {
      closeCount += 1;
    },
    pages: () => [page],
  } as unknown as BrowserContext;
  return {
    context,
    page,
    launch: async () => context,
    closeCount: () => closeCount,
  };
}

test("a session whose Instagram page fails to load closes its browser and rethrows", async () => {
  const timeout = new Error("page.goto: Timeout 30000ms exceeded.");
  const browser = fakeBrowser(async () => {
    throw timeout;
  });

  await expect(openInstagramSession({ launch: browser.launch })).rejects.toBe(timeout);

  expect(browser.closeCount()).toBe(1);
});

test("a session whose Instagram page loads keeps its browser open", async () => {
  const browser = fakeBrowser(async () => null);

  await expect(openInstagramSession({ launch: browser.launch })).resolves.toStrictEqual({
    context: browser.context,
    page: browser.page,
  });

  expect(browser.closeCount()).toBe(0);
});
