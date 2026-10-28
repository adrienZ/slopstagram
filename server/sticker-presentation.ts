import type { SidebarUser } from "./sidebar-users.ts";
import { formatStickerLabel, type StickerPlace } from "./timeline-stickers.ts";
import { getUserTimelineUrl } from "./helper.ts";

export interface StickerPresentation {
  kind: string;
  label: string;
  place?: StickerPlace;
  title: string;
  profileUrl?: string;
  avatarUrl?: string;
}

export function presentSticker(
  kind: string,
  label: string,
  users: Array<SidebarUser>,
  expanded = false,
  place?: StickerPlace,
): StickerPresentation {
  const username = label.trim().replace(/^@/u, "").toLowerCase();
  const user =
    kind === "mention"
      ? users.find((candidate) => candidate.username.toLowerCase() === username)
      : undefined;
  return {
    kind,
    title: label,
    place,
    label: expanded && kind !== "mention" ? label : formatStickerLabel(kind, label),
    profileUrl: user === undefined ? undefined : getUserTimelineUrl(user.username),
    avatarUrl: user?.avatarPath ?? undefined,
  };
}
