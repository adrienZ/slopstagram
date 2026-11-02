import { getReportDateUrl, getStoryDate } from "../sdk/lib/story-date-service.ts";

export function navigateToReportDate(date: Date): void {
  globalThis.location.assign(getReportDateUrl(getStoryDate(date)));
}

export function getTimelineDayId(day: string): string {
  return `story-day-${day}`;
}

export function getOldestStoryDate(availableDates: Array<string>, today: string): string {
  let oldest = today;
  for (const day of availableDates) {
    if (day < oldest) {
      oldest = day;
    }
  }
  return oldest;
}

export function getDisabledStoryDates(availableDates: Array<string>) {
  return [(date: Date) => !availableDates.includes(getStoryDate(date))];
}
