import type { TestContext } from "vitest";
import { createDrizzle } from "@@/core/database/client.ts";
import { migrateDatabase } from "@@/core/database/migrate.ts";
import type { StoryItem } from "@@/core/domains/instagram/instagram-types.ts";
import { userSummaries } from "@@/core/database/entities/user-summary.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";
import { StoryRepository } from "@@/core/database/repositories/story-repository.ts";
import { createMemoryStorage } from "./memory-storage.ts";

export function createMigratedDatabase() {
  const database = createDrizzle(":memory:");
  migrateDatabase(database);
  return database;
}

/** A migrated in-memory database, closed when the test ends. */
export function createTestDatabase(context: Pick<TestContext, "onTestFinished">) {
  const database = createMigratedDatabase();
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

export async function saveSummaryUsers(
  runtime: Pick<Runtime, "users">,
  usernames: Array<string> = ["summaryuser"],
) {
  await Promise.all(
    usernames.map(async (username) => {
      await runtime.users.save({ full_name: username, id: username, pk: username, username });
    }),
  );
}

export function countSummaries(runtime: Pick<Runtime, "database">) {
  return runtime.database.select().from(userSummaries).all().length;
}
