import type { StoryOutputUser } from "@@/core/report-types.ts";

export function getReportUserKey(user: StoryOutputUser): string {
  return user.username.trim();
}
