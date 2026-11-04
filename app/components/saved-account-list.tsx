import type { SavedAccount } from "@@/core/domains/accounts/saved-accounts.ts";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { formatUserHandle } from "../utils/helper.ts";
import { presentSticker } from "../utils/sticker-presentation.ts";
import { Sticker } from "./sticker.tsx";

/** The saved accounts the Assistant listed, as mention stickers, rendered from the tool's data. */
export function SavedAccountList({
  accounts,
  listed,
}: {
  /** The preloaded accounts, which give each sticker its avatar. */
  accounts: Array<SidebarUser>;
  listed: Array<SavedAccount>;
}) {
  if (listed.length === 0) {
    return <p className="tw:text-sm tw:text-muted-foreground">Aucun compte enregistré.</p>;
  }
  return (
    <ul aria-label="Comptes enregistrés" className="tw:flex tw:flex-wrap tw:gap-2">
      {listed.map((account) => (
        <li key={account.username} className="tw:flex tw:items-center tw:gap-1.5">
          <Sticker
            sticker={presentSticker("mention", formatUserHandle(account.username), accounts)}
          />
          {account.fullName !== null && account.fullName.length > 0 && (
            <span className="tw:text-sm tw:text-muted-foreground">{account.fullName}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
