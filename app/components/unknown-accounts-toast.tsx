import { useTranslation } from "react-i18next";
import { formatUserHandle } from "../utils/helper.ts";
import { ErrorToast } from "./error-toast.tsx";

export function UnknownAccountsToast({ usernames }: { usernames: Array<string> }) {
  const { t } = useTranslation();
  const handles = usernames.map((username) => formatUserHandle(username)).join(", ");
  const message = t("graph.unknownAccounts", { count: usernames.length, handles });

  return <ErrorToast key={message} message={message} />;
}
