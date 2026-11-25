import { afterEach, expect, test } from "vitest";
import { changeLanguage, i18n } from "../app/i18n/index.ts";

afterEach(async () => {
  await changeLanguage("fr");
});

test("the interface is French by default", () => {
  expect(i18n.language).toBe("fr");
  expect(i18n.t("common.map")).toBe("Carte");
});

test("a non-default language is only loaded when it is selected", async () => {
  expect(i18n.hasResourceBundle("en", "translation")).toBe(false);

  await changeLanguage("en");

  expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
  expect(i18n.t("graph.title")).toBe("Mention graph");
});

test("a count picks the singular or plural form of the current language", async () => {
  const counts = [0, 1, 2];

  expect(counts.map((count) => i18n.t("common.storyCount", { count }))).toStrictEqual([
    "0 story",
    "1 story",
    "2 stories",
  ]);

  await changeLanguage("en");

  expect(counts.map((count) => i18n.t("stickers.count", { count }))).toStrictEqual([
    "0 stickers",
    "1 sticker",
    "2 stickers",
  ]);
});
