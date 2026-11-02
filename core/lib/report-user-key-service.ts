import type { StoryOutputUser } from "../report-types.ts";

export function getReportUserKey(user: StoryOutputUser): string {
  return user.username.trim();
}
