import { getReportDateUrl, getStoryDate } from "../sdk/lib/story-date-service.ts";

export function navigateToReportDate(date: Date): void {
  globalThis.location.assign(getReportDateUrl(getStoryDate(date)));
}

export function getTimelineDayId(day: string): string {
  return `story-day-${day}`;
}

export function getDisabledStoryDates(availableDates: Array<string>) {
  return [(date: Date) => !availableDates.includes(getStoryDate(date))];
}
