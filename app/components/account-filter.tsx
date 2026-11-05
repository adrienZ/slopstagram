import { useId } from "react";
import { FilterIcon } from "lucide-react";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { Badge } from "../shadcn/ui/badge.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import { Checkbox } from "../shadcn/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/ui/popover.tsx";
import { formatUserHandle, formatUserInitials } from "../utils/helper.ts";

/** A popover listing accounts as checkboxes; no checked account means all of them. */
export function AccountFilter({
  accounts,
  selected,
  onToggle,
  onClear,
}: {
  accounts: Array<SidebarUser>;
  selected: Array<string>;
  onToggle: (username: string) => void;
  onClear: () => void;
}) {
  const id = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <FilterIcon aria-hidden="true" />
          Filtrer par compte
          {selected.length > 0 && <Badge>{selected.length}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Comptes affichés">
        <ul className="tw:max-h-72 tw:space-y-1 tw:overflow-y-auto">
          {accounts.map((account) => {
            const checkboxId = `${id}-${account.username}`;
            const handle = formatUserHandle(account.username);
            return (
              <li key={account.username}>
                <label
                  htmlFor={checkboxId}
                  className="tw:flex tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-md tw:p-1 tw:hover:bg-muted"
                >
                  <Checkbox
                    id={checkboxId}
                    aria-label={handle}
                    checked={selected.includes(account.username)}
                    onCheckedChange={() => {
                      onToggle(account.username);
                    }}
                  />
                  <Avatar size="sm">
                    <AvatarImage src={account.avatarPath} alt="" />
                    <AvatarFallback>{formatUserInitials(account.username)}</AvatarFallback>
                  </Avatar>
                  <span className="tw:truncate">{handle}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <Button variant="ghost" size="sm" disabled={selected.length === 0} onClick={onClear}>
          Tous les comptes
        </Button>
      </PopoverContent>
    </Popover>
  );
}
