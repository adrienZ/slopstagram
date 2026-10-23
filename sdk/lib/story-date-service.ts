import { z } from "zod";

export const storyDateSchema = z.iso.date();
export const STORY_TIME_ZONE = "Europe/Paris";

export function getStoryDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function getMidnight(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STORY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hours = Number(parts.find((part) => part.type === "hour")?.value);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value);
  return new Date(date.getTime() - (hours * 60 + minutes) * 60_000);
}

export function getStoryDayRange(day: string) {
  const date = new Date(`${storyDateSchema.parse(day)}T00:00:00Z`);
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return { start: getMidnight(date), end: getMidnight(nextDate) };
}

export function getReportDateUrl(day: string): string {
  return `/report?date=${encodeURIComponent(storyDateSchema.parse(day))}`;
}

export function formatStoryDay(day: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: STORY_TIME_ZONE,
    dateStyle: "long",
  }).format(new Date(`${day}T12:00:00Z`));
}

export function formatStoryViewTitle(selectedDate: string, today: string): string {
  return selectedDate === today
    ? "Stories des dernières 24 heures"
    : `Stories du ${formatStoryDay(selectedDate)}`;
}
