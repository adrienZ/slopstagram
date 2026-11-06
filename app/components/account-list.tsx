import type { Account } from "@@/core/domains/accounts/accounts.ts";
import { formatUserHandle } from "@/utils/helper.ts";

/** The accounts the Assistant listed, as plain text. */
export function AccountList({
  emptyLabel = "Aucun compte.",
  label = "Comptes",
  listed,
}: {
  emptyLabel?: string;
  label?: string;
  listed: Array<Account>;
}) {
  if (listed.length === 0) {
    return <p>{emptyLabel}</p>;
  }
  return (
    <ul aria-label={label} className="tw:grid tw:gap-1">
      {listed.map((account) => (
        <li key={account.username}>
          {formatUserHandle(account.username)}
          {account.fullName !== null && account.fullName.length > 0 && ` · ${account.fullName}`}
        </li>
      ))}
    </ul>
  );
}
