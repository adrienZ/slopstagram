import type { StoryOutputUser } from "./types.ts";

export function getReportUserKey(user: StoryOutputUser): string {
  return `username:${user.username.trim()}`;
}
