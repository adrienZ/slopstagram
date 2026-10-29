import { isNotFound } from "@tanstack/react-router";
import { beforeAll, expect, test } from "vitest";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { loadOrNotFound } from "../server/query-service.ts";
import { loadUserTimeline } from "../server/user-timeline-handler.tsx";
import { seedRecordedStories } from "./seed.ts";

beforeAll(async () => {
  migrateDatabase();
  await seedRecordedStories();
});

test("an unknown account becomes a TanStack not-found", () => {
  let thrown: unknown;
  try {
    loadOrNotFound(() => loadUserTimeline("nobody"));
  } catch (error) {
    thrown = error;
  }

  expect(isNotFound(thrown)).toBe(true);
});

test("a known account passes through", () => {
  const timeline = loadOrNotFound(() => loadUserTimeline("user_019"));

  expect(timeline.timeline.timelineUser.username).toBe("user_019");
});

test("other errors are not turned into not-found", () => {
  const failure = new Error("database is locked");

  expect(() =>
    loadOrNotFound(() => {
      throw failure;
    }),
  ).toThrow(failure);
});
