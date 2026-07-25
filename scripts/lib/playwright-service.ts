import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";

const INSTAGRAM_HOME_URL = "https://www.instagram.com/";
const DEFAULT_PROFILE_PATH = ".playwright/user-data";

export type InstagramSession = {
  context: BrowserContext;
  page: Page;
};

export async function openInstagramSession(
  profileArg = DEFAULT_PROFILE_PATH,
): Promise<InstagramSession> {
  const profilePath = path.resolve(profileArg);
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: true,
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(INSTAGRAM_HOME_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  return { context, page };
}

export async function closeInstagramSession(
  session: InstagramSession,
): Promise<void> {
  await session.context.close();
}
