import { formatUserHandle } from "../utils/helper.ts";
import { ErrorToast } from "./error-toast.tsx";

export function UnknownAccountsToast({ usernames }: { usernames: Array<string> }) {
  const handles = usernames.map((username) => formatUserHandle(username)).join(", ");
  const message = `${usernames.length > 1 ? "Comptes absents" : "Compte absent"} du graphe : ${handles}. Le graphe complet est affiché.`;
  return <ErrorToast key={message} message={message} />;
}
