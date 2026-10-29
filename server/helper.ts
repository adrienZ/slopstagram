import type { StoriesManifestReport, StoryOutputUser } from "../sdk/report-types.ts";

export function formatReportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        month: "long",
        timeZone: "Europe/Paris",
        timeZoneName: "short",
        year: "numeric",
      })
        .format(date)
        .replace(",", " à");
}

export function formatUserHandle(username: string): string {
  return `@${username.trim().replace(/^@/u, "")}`;
}

export function formatUserName(user: StoryOutputUser): string {
  const fullName = user.full_name?.trim();
  const username = user.username.trim();
  if (fullName !== undefined && fullName.length > 0 && username.length > 0) {
    return `${fullName} (@${username})`;
  }

  return fullName !== undefined && fullName.length > 0 ? fullName : formatUserHandle(username);
}

export function getUserTimelineUrl(username: string): string {
  return `/users/${encodeURIComponent(username.trim())}`;
}

export function getInstagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username.trim().replace(/^@/u, ""))}/`;
}

export function getRankedUsers(report: StoriesManifestReport): Array<StoryOutputUser> {
  const orderByReel = new Map<string, number>();
  for (const user of report.manifest.users) {
    orderByReel.set(user.reel_id, Math.min(orderByReel.get(user.reel_id) ?? Infinity, user.order));
  }
  return report.output.users
    .map((user, index) => ({
      index,
      rank: Math.min(...user.reel_ids.map((id) => orderByReel.get(id) ?? Infinity)),
      user,
    }))
    .toSorted((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ user }) => user);
}

export function getStoryUrl(username: string, mediaPk: string): string {
  return `https://www.instagram.com/stories/${encodeURIComponent(username.trim())}/${encodeURIComponent(mediaPk)}/`;
}
