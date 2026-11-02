import type { TestContext } from "vitest";
import { createDrizzle } from "../sdk/database/client.ts";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import type { StoryItem } from "../sdk/instagram-types.ts";
import { userSummaries } from "../sdk/entities/user-summary.ts";
import { InstagramUserRepository } from "../sdk/repositories/instagram-user-repository.ts";
import { UserSummaryRepository } from "../sdk/repositories/user-summary-repository.ts";
import { StoryRepository } from "../sdk/repositories/story-repository.ts";
import { createMemoryStorage } from "./memory-storage.ts";

/** A migrated in-memory database, closed when the test ends. */
export function createTestDatabase(context: Pick<TestContext, "onTestFinished">) {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  context.onTestFinished(() => {
    database.$client.close();
  });
  return database;
}

/** The real story repository on a migrated in-memory database, with in-memory story file storage. */
export function createStoryFixtures(context: Pick<TestContext, "onTestFinished">) {
  return {
    storyRepository: new StoryRepository(createTestDatabase(context)),
    storyStorage: createMemoryStorage<StoryItem>(),
  };
}

/** The real user summary repository, with the Instagram users it needs to own summaries. */
export async function createSummaryFixtures(
  context: Pick<TestContext, "onTestFinished">,
  usernames: Array<string> = ["summaryuser"],
) {
  const database = createTestDatabase(context);
  const users = new InstagramUserRepository(database);
  await Promise.all(
    usernames.map(async (username) => {
      await users.save({ full_name: username, id: username, pk: username, username });
    }),
  );
  return {
    countSummaries: () => database.select().from(userSummaries).all().length,
    database,
    repository: new UserSummaryRepository(database),
    users,
  };
}
