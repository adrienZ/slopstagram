import { beforeAll, expect, test } from "vitest";
import { migrateDatabase } from "../sdk/database/migrate.ts";
import { loadReport } from "../server/report-handler.tsx";
import { seedRecordedStories } from "./seed.ts";

const now = new Date("2026-07-26T12:00:00.000Z");
const threeDaysLater = new Date("2026-07-29T12:00:00.000Z");

beforeAll(async () => {
  migrateDatabase();
  await seedRecordedStories({ publishedBefore: { now, seconds: 3600 } });
});

test("today's feed lists the recorded accounts newest first with their stored stories", () => {
  const report = loadReport(now);

  expect(report).toMatchObject({
    selectedDate: "2026-07-26",
    today: "2026-07-26",
    availableDates: ["2026-07-26"],
  });
  expect(
    report.users.map(({ user, stories }) => ({
      username: user.username,
      avatar: user.profile_pic_url,
      stories: stories.map((story) => [
        story.mediaPk,
        story.mediaType,
        story.position,
        story.count,
      ]),
    })),
  ).toEqual([
    {
      username: "user_041",
      avatar: "images/avatars/700000000000188.jpg",
      stories: [["700000000000271", "Image", 1, 1]],
    },
    {
      username: "user_019",
      avatar: "images/avatars/700000000000193.jpg",
      stories: [
        ["700000000000292", "Vidéo", 1, 2],
        ["700000000000314", "Vidéo", 2, 2],
      ],
    },
  ]);
  expect(report.users[0]?.avatar).toBe("/media/avatars/700000000000188.jpg");
});

test("the sidebar lists every saved account with its cached avatar path", () => {
  expect(loadReport(now).sidebarUsers).toEqual([
    { username: "user_019", avatarPath: "/media/avatars/700000000000193.jpg" },
    { username: "user_041", avatarPath: "/media/avatars/700000000000188.jpg" },
  ]);
});

test("story cards carry the stickers saved with the story", () => {
  const cards = loadReport(now).users.flatMap(({ stories }) => stories);

  expect(cards.map((card) => card.stickerDetails?.stickers?.map(({ kind }) => kind))).toEqual([
    ["mention", "mention"],
    [],
    [],
  ]);
  expect(cards.map((card) => card.stickerDetails?.music.map(({ label }) => label))).toEqual([
    [],
    ["cats - liminalx, exhibit"],
    ["Les revenants - Vanessa Paradis"],
  ]);
});

test("an older day shows the stories published that day, and today drops out of the rolling window", () => {
  const today = loadReport(threeDaysLater);
  const day = loadReport(threeDaysLater, "2026-07-26");

  expect(today.users).toEqual([]);
  expect(today.availableDates).toEqual(["2026-07-26"]);
  expect(day.selectedDate).toBe("2026-07-26");
  expect(day.users.map(({ user }) => user.username)).toEqual(["user_041", "user_019"]);
});

test("a day without stories is empty, and a future date falls back to today", () => {
  expect(loadReport(threeDaysLater, "2026-07-27").users).toEqual([]);
  expect(loadReport(now, "2030-01-01").selectedDate).toBe("2026-07-26");
});

test("a story deep link selects the day the story was published", () => {
  const report = loadReport(threeDaysLater, undefined, "700000000000292");

  expect(report.today).toBe("2026-07-29");
  expect(report.selectedDate).toBe("2026-07-26");
  expect(report.users.flatMap(({ stories }) => stories.map(({ mediaPk }) => mediaPk))).toContain(
    "700000000000292",
  );
});

test("an unknown story deep link keeps today's feed", () => {
  expect(loadReport(now, undefined, "missing").selectedDate).toBe("2026-07-26");
});
