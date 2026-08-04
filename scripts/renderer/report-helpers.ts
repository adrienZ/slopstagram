import { type StoriesManifestReport, type StoryOutputUser } from "../lib/types.ts";

export function formatReportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        day: "numeric", hour: "2-digit", hour12: false, minute: "2-digit",
        month: "long", timeZoneName: "short", year: "numeric",
      }).format(date).replace(",", " à");
}

export function formatUserName(user: StoryOutputUser): string {
  const fullName = user.full_name?.trim();
  const username = user.username?.trim();
  return fullName && username ? `${fullName} (${username})` : fullName || username || "Utilisateur inconnu";
}

export function getRankedUsers(report: StoriesManifestReport): StoryOutputUser[] {
  const orderByReel = new Map<string, number>();
  for (const user of report.manifest.users) {
    orderByReel.set(user.reel_id, Math.min(orderByReel.get(user.reel_id) ?? Infinity, user.order));
  }
  return report.output.users
    .map((user, index) => ({ index, rank: Math.min(...user.reel_ids.map((id) => orderByReel.get(id) ?? Infinity)), user }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ user }) => user);
}

export function getStoryUrl(username: string | null, mediaPk: string): string | undefined {
  return username?.trim()
    ? `https://www.instagram.com/stories/${encodeURIComponent(username)}/${encodeURIComponent(mediaPk)}/`
    : undefined;
}
