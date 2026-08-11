import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import cliConfig from "../../.playwright/cli.config.json" with { type: "json" };

const INSTAGRAM_HOME_URL = "https://www.instagram.com/";
export const DEFAULT_PROFILE_PATH = cliConfig.browser.userDataDir;

export type InstagramSession = {
  context: BrowserContext;
  page: Page;
};

export type OpenInstagramSessionOptions = {
  headless?: boolean;
  profilePath?: string;
};

export async function openInstagramSession(
  options: OpenInstagramSessionOptions = {},
): Promise<InstagramSession> {
  const profilePath = path.resolve(options.profilePath ?? DEFAULT_PROFILE_PATH);
  const context = await chromium.launchPersistentContext(profilePath, {
    ...cliConfig.browser.launchOptions,
    headless: options.headless ?? true,
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(INSTAGRAM_HOME_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  return { context, page };
}

export async function closeInstagramSession(session: InstagramSession): Promise<void> {
  await session.context.close();
}
