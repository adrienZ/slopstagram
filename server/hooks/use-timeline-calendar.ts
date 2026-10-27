import { useState } from "react";
import { getStoryDate } from "../../sdk/lib/story-date-service.ts";
import { getTimelineDayId } from "../story-navigation.ts";

export function useTimelineCalendar(days: Array<string>, today: string) {
  const [selectedDate, setSelectedDate] = useState(days[0] ?? today);

  function selectDate(date: Date): void {
    const requestedDay = getStoryDate(date);
    const day = days.find((key) => key <= requestedDay) ?? days.at(-1);
    if (day === undefined) {
      return;
    }
    setSelectedDate(day);
    globalThis.requestAnimationFrame(() => {
      globalThis.document.querySelector(`#${getTimelineDayId(day)}`)?.scrollIntoView({
        behavior: globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    });
  }

  return {
    selectedDate,
    onSelectDate: selectDate,
    disabledDates: [(date: Date) => !days.includes(getStoryDate(date))],
  };
}
