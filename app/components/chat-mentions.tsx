import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { splitMentions } from "../utils/chat-mentions.ts";
import { presentSticker } from "../utils/sticker-presentation.ts";
import { Sticker } from "./sticker.tsx";

function MentionSticker({ username, users }: { username: string; users: Array<SidebarUser> }) {
  return <Sticker sticker={presentSticker("mention", `@${username}`, users)} />;
}

/** A sent message, with the mentions of saved accounts shown as stickers. */
export function MentionedText({ text, users }: { text: string; users: Array<SidebarUser> }) {
  return (
    <p className="tw:whitespace-pre-wrap">
      {splitMentions(text, users).map((segment, index) =>
        segment.type === "text" ? (
          segment.text
        ) : (
          <MentionSticker
            key={`${index}-${segment.username}`}
            username={segment.username}
            users={users}
          />
        ),
      )}
    </p>
  );
}

/** The accounts an assistant tool returned, as stickers. */
export function AccountList({
  usernames,
  users,
}: {
  usernames: Array<string>;
  users: Array<SidebarUser>;
}) {
  return (
    <ul
      aria-label="Comptes"
      className="tw:flex tw:max-h-48 tw:flex-wrap tw:gap-1 tw:overflow-y-auto"
    >
      {usernames.map((username) => (
        <li key={username}>
          <MentionSticker username={username} users={users} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Sits behind the transparent message field and paints its mentions like a sticker. It adds
 * no padding, so the text stays aligned with what the field shows.
 */
export function MentionBackdrop({ text, users }: { text: string; users: Array<SidebarUser> }) {
  return (
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:overflow-hidden tw:px-2.5 tw:py-2 tw:text-base tw:wrap-break-word tw:whitespace-pre-wrap tw:md:text-sm"
    >
      {splitMentions(text, users).map((segment, index) =>
        segment.type === "text" ? (
          segment.text
        ) : (
          <mark
            key={`${index}-${segment.username}`}
            className="tw:rounded-sm tw:bg-primary/15 tw:text-foreground tw:ring-2 tw:ring-primary/15"
          >
            {`@${segment.username}`}
          </mark>
        ),
      )}
    </div>
  );
}
