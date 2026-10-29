import { expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTimelineCalendar } from "../../server/hooks/use-timeline-calendar.ts";

test("a requested gap chooses the nearest earlier available day", async () => {
  const day = globalThis.document.createElement("section");
  day.id = "story-day-2026-07-23";
  globalThis.document.body.append(day);
  const scroll = vi.spyOn(day, "scrollIntoView");
  const { result } = renderHook(() =>
    useTimelineCalendar(["2026-07-25", "2026-07-23"], "2026-07-26"),
  );
  expect(result.current.selectedDate).toBe("2026-07-25");
  act(() => {
    result.current.onSelectDate(new Date("2026-07-24T12:00:00Z"));
  });
  expect(result.current.selectedDate).toBe("2026-07-23");
  await waitFor(() => {
    expect(scroll).toHaveBeenCalled();
  });
  expect(result.current.disabledDates[0](new Date("2026-07-24T12:00:00Z"))).toBe(true);
  expect(result.current.disabledDates[0](new Date("2026-07-23T12:00:00Z"))).toBe(false);
  day.remove();
});

test("requests before the oldest day select the oldest day even if its element is absent", async () => {
  const frame = vi.spyOn(globalThis, "requestAnimationFrame");
  const { result } = renderHook(() =>
    useTimelineCalendar(["2026-07-25", "2026-07-23"], "2026-07-26"),
  );
  act(() => {
    result.current.onSelectDate(new Date("2026-07-01T12:00:00Z"));
  });
  expect(result.current.selectedDate).toBe("2026-07-23");
  await waitFor(() => {
    expect(frame).toHaveBeenCalled();
  });
});

test("an empty timeline starts on today and selecting a day has no scroll side effect", () => {
  const frame = vi.spyOn(globalThis, "requestAnimationFrame");
  const { result } = renderHook(() => useTimelineCalendar([], "2026-07-26"));
  expect(result.current.selectedDate).toBe("2026-07-26");
  act(() => {
    result.current.onSelectDate(new Date("2026-07-25T12:00:00Z"));
  });
  expect(result.current.selectedDate).toBe("2026-07-26");
  expect(frame).not.toHaveBeenCalled();
});
