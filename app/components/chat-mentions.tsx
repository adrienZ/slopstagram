import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { splitMentions } from "../utils/chat-mentions.ts";
import { formatUserHandle } from "../utils/helper.ts";
import { presentSticker } from "../utils/sticker-presentation.ts";
import { MentionAvatar, Sticker } from "./sticker.tsx";

export function MentionedText({ accounts, text }: { accounts: Array<SidebarUser>; text: string }) {
  return splitMentions(text, accounts).map((segment, index) =>
    segment.type === "text" ? (
      segment.text
    ) : (
      <Sticker
        // Segments have no id; their position in a sent message never changes.
        key={`${index}-${segment.account.username}`}
        sticker={presentSticker("mention", formatUserHandle(segment.account.username), accounts)}
      />
    ),
  );
}

/** Paints with a box-shadow spread instead of padding, so the text stays where the field shows it. */
export function MentionBackdrop({
  accounts,
  text,
}: {
  accounts: Array<SidebarUser>;
  text: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:overflow-hidden tw:px-2.5 tw:py-2 tw:text-base tw:wrap-break-word tw:whitespace-pre-wrap tw:md:text-sm"
    >
      {splitMentions(text, accounts).map((segment, index) =>
        segment.type === "text" ? (
          segment.text
        ) : (
          <mark
            // Segments have no id and are rebuilt from the text on each keystroke.
            key={`${index}-${segment.account.username}`}
            className="tw:rounded-4xl tw:bg-secondary tw:text-secondary-foreground tw:ring-3 tw:ring-secondary tw:box-decoration-clone"
          >
            {segment.text}
          </mark>
        ),
      )}
    </div>
  );
}

export function MentionSuggestionList({
  id,
  onHover,
  onPick,
  options,
}: {
  id: string;
  onHover: (index: number) => void;
  onPick: (username: string) => void;
  options: Array<{ account: SidebarUser; active: boolean; id: string; index: number }>;
}) {
  return (
    <ul
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- A combobox popup: the message field keeps the focus and the keyboard (aria-activedescendant).
      role="listbox"
      aria-label="Suggestions de mentions"
      className="tw:absolute tw:inset-x-0 tw:bottom-full tw:z-10 tw:mb-2 tw:max-h-[50svh] tw:overflow-y-auto tw:rounded-lg tw:border tw:bg-popover tw:p-1 tw:text-popover-foreground tw:shadow-md"
    >
      {options.map(({ account, active, id: optionId, index }) => (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- Picked from the message field's keyboard, as the listbox.
        <li
          key={account.username}
          id={optionId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- Picked from the message field's keyboard, as the listbox.
          role="option"
          aria-selected={active}
          className="tw:flex tw:cursor-default tw:items-center tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-sm tw:aria-selected:bg-accent tw:aria-selected:text-accent-foreground"
          // Keeps the focus in the message field.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onMouseMove={() => {
            onHover(index);
          }}
          onClick={() => {
            onPick(account.username);
          }}
        >
          <MentionAvatar key={account.avatarPath} src={account.avatarPath} />
          {formatUserHandle(account.username)}
        </li>
      ))}
    </ul>
  );
}
