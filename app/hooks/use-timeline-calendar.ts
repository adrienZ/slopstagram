import { useState } from "react";
import { useMedia } from "react-use";
import { getStoryDate } from "../../sdk/lib/story-date-service.ts";
import { getOldestStoryDate, getTimelineDayId } from "../story-navigation.ts";

export function useTimelineCalendar(days: Array<string>, today: string) {
  const [selectedDate, setSelectedDate] = useState(days[0] ?? today);
  const reduceMotion = useMedia("(prefers-reduced-motion: reduce)", false);

  function selectDate(date: Date): void {
    const requestedDay = getStoryDate(date);
    const day = days.find((key) => key <= requestedDay) ?? days.at(-1);
    if (day === undefined) {
      return;
    }
    setSelectedDate(day);
    globalThis.requestAnimationFrame(() => {
      globalThis.document.querySelector(`#${getTimelineDayId(day)}`)?.scrollIntoView({
        behavior: reduceMotion ? "instant" : "smooth",
        block: "start",
      });
    });
  }

  return {
    selectedDate,
    oldestDate: getOldestStoryDate(days, today),
    onSelectDate: selectDate,
    disabledDates: [(date: Date) => !days.includes(getStoryDate(date))],
  };
}
