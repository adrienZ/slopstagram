import { useNavigate } from "@tanstack/react-router";
import { useId, useMemo } from "react";
import { toast } from "sonner";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";

/** URL account filters select the union of direct neighborhoods, including links between neighbors. */
export function useMentionGraphFilter(data: MentionGraphPageData, requestedAccounts?: string) {
  const navigate = useNavigate({ from: "/graph" });
  const toastId = useId();
  const filtered = useMemo(() => {
    const byUsername = Map.groupBy(data.accounts, ({ username }) => username.toLowerCase());
    const requested = requestedAccounts?.split(",").filter((username) => username.length > 0) ?? [];
    const invalid = requested.some(
      (username) => byUsername.get(username.toLowerCase())?.length !== 1,
    );
    const selected = invalid
      ? []
      : [
          ...new Set(
            requested.flatMap(
              (username) =>
                byUsername.get(username.toLowerCase())?.map((account) => account.username) ?? [],
            ),
          ),
        ];
    if (selected.length === 0) {
      return { nodes: data.nodes, connections: data.connections, selected, invalid };
    }
    const chosen = new Set(selected.map((username) => username.toLowerCase()));
    const selectedIds = new Set(
      data.nodes
        .filter((node) => node.kind === "account" && chosen.has(node.username.toLowerCase()))
        .map(({ id }) => id),
    );
    const displayedIds = new Set(selectedIds);
    for (const connection of data.connections) {
      if (selectedIds.has(connection.source) || selectedIds.has(connection.target)) {
        displayedIds.add(connection.source);
        displayedIds.add(connection.target);
      }
    }
    return {
      nodes: data.nodes.filter(({ id }) => displayedIds.has(id)),
      connections: data.connections.filter(
        ({ source, target }) => displayedIds.has(source) && displayedIds.has(target),
      ),
      selected,
      invalid,
    };
  }, [data.accounts, data.connections, data.nodes, requestedAccounts]);

  const bindNotification = useMemo(
    () => (element: HTMLDivElement | null) => {
      if (element !== null && filtered.invalid) {
        toast.error("Compte inconnu ou ambigu : le graphe complet est affiché.", { id: toastId });
      }
      return () => {
        toast.dismiss(toastId);
      };
    },
    [filtered.invalid, requestedAccounts, toastId],
  );

  function update(selected: Set<string>) {
    const ordered = data.accounts.flatMap(({ username }) =>
      selected.has(username) ? [username] : [],
    );
    void navigate({
      to: ".",
      search: { accounts: ordered.length === 0 ? undefined : ordered.join(",") },
      replace: true,
      resetScroll: false,
    });
  }

  return {
    ...filtered,
    accounts: data.accounts,
    bindNotification,
    toggle: (username: string) => {
      const selected = new Set(filtered.selected);
      if (!selected.delete(username)) {
        selected.add(username);
      }
      update(selected);
    },
    clear: () => {
      update(new Set());
    },
  };
}
