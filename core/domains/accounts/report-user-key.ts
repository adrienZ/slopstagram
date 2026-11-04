import type { StoryOutputUser } from "@@/core/domains/fetch-run/report-types.ts";

export function getReportUserKey(user: StoryOutputUser): string {
  return user.username.trim();
}
