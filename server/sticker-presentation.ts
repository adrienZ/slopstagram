import type { SidebarUser } from "./sidebar-users.ts";
import { formatStickerLabel } from "./timeline-stickers.ts";
import { getUserTimelineUrl } from "./helper.ts";

export interface StickerPresentation {
  kind: string;
  label: string;
  category?: string;
  title: string;
  profileUrl?: string;
  avatarUrl?: string;
}

export function presentSticker(
  kind: string,
  label: string,
  users: Array<SidebarUser>,
  expanded = false,
  category?: string,
): StickerPresentation {
  const username = label.trim().replace(/^@/u, "").toLowerCase();
  const user =
    kind === "mention"
      ? users.find((candidate) => candidate.username.toLowerCase() === username)
      : undefined;
  return {
    kind,
    title: label,
    category,
    label: expanded && kind !== "mention" ? label : formatStickerLabel(kind, label),
    profileUrl: user === undefined ? undefined : getUserTimelineUrl(user.username),
    avatarUrl: user?.avatarPath ?? undefined,
  };
}
