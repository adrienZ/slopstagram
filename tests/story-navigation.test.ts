import { afterEach, expect, test, vi } from "vitest";
import { navigateToReportDate, getDisabledStoryDates } from "../server/story-navigation.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("report dates perform a document navigation using the Paris publication day", () => {
  // Document navigation is the external boundary: no server functions or router are mocked.
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });
  navigateToReportDate(new Date("2026-07-25T23:30:00Z"));
  expect(assign).toHaveBeenCalledExactlyOnceWith("/report?date=2026-07-26");
});

test("calendar availability follows Paris day boundaries", () => {
  const [disabled] = getDisabledStoryDates(["2026-07-26"]);
  expect(disabled(new Date("2026-07-25T23:30:00Z"))).toBe(false);
  expect(disabled(new Date("2026-07-25T20:00:00Z"))).toBe(true);
});
