import { useId } from "react";
import { cn } from "cn";
import { FilterIcon, MapPinIcon, XIcon } from "lucide-react";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import { Badge } from "../shadcn/ui/badge.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import { Checkbox } from "../shadcn/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../shadcn/ui/popover.tsx";
import { formatUserHandle, formatUserInitials } from "../utils/helper.ts";

interface AccountFilterProps {
  accounts: Array<SidebarUser>;
  selected: Array<string>;
  onToggle: (username: string) => void;
  /** Resets every filter: the accounts and the place. */
  onClear: () => void;
  /** The place the map is narrowed to, shown as an entry that removes it. */
  place?: { name: string; onRemove: () => void };
}

/** The place filter as an entry with the place's name and a remove button. */
function PlaceFilterEntry({ name, onRemove }: NonNullable<AccountFilterProps["place"]>) {
  return (
    <div className="tw:flex tw:items-center tw:gap-2 tw:rounded-md tw:border tw:py-1 tw:pr-1 tw:pl-2">
      <MapPinIcon aria-hidden="true" className="tw:size-4 tw:shrink-0" />
      <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:text-sm">{name}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Retirer le lieu ${name}`}
        onClick={onRemove}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * The clear action, the place filter when there is one, then the accounts as checkboxes; no
 * checked account means all of them.
 */
export function AccountChecklist({
  accounts,
  selected,
  onToggle,
  onClear,
  place,
  listClassName = "tw:max-h-72",
}: AccountFilterProps & {
  /** Sizes the scrollable list. Defaults to a fixed maximum height. */
  listClassName?: string;
}) {
  const id = useId();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={selected.length === 0 && place === undefined}
        onClick={onClear}
      >
        Effacer les filtres
      </Button>
      {place !== undefined && <PlaceFilterEntry {...place} />}
      <ul className={cn("tw:space-y-1 tw:overflow-y-auto", listClassName)}>
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
    </>
  );
}

/** A popover of the filters: the place, then the accounts as checkboxes. */
export function AccountFilter(props: AccountFilterProps) {
  const activeCount = props.selected.length + (props.place === undefined ? 0 : 1);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <FilterIcon aria-hidden="true" />
          Filtrer par compte
          {activeCount > 0 && <Badge>{activeCount}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Filtres affichés">
        <AccountChecklist {...props} />
      </PopoverContent>
    </Popover>
  );
}
