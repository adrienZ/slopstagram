import { useTranslation } from "react-i18next";
import type { Account } from "@@/core/domains/accounts/accounts.ts";
import { formatUserHandle } from "../utils/helper.ts";

export function AccountList({
  emptyLabel,
  label,
  listed,
}: {
  emptyLabel?: string;
  label?: string;
  listed: Array<Account>;
}) {
  const { t } = useTranslation();

  if (listed.length === 0) {
    return <p>{emptyLabel ?? t("assistant.noAccounts")}</p>;
  }

  return (
    <ul aria-label={label ?? t("assistant.accounts")} className="tw:grid tw:gap-1">
      {listed.map((account) => (
        <li key={account.username}>
          {formatUserHandle(account.username)}
          {account.fullName !== null && account.fullName.length > 0 && ` · ${account.fullName}`}
        </li>
      ))}
    </ul>
  );
}
