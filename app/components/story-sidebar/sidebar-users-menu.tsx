import { ChevronRightIcon } from "lucide-react";
import type { SidebarUser } from "../../loaders/sidebar-users.ts";
import { Avatar, AvatarFallback, AvatarImage } from "../../shadcn/ui/avatar.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../shadcn/ui/collapsible.tsx";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "../../shadcn/ui/sidebar.tsx";
import { formatUserHandle, formatUserInitials, getUserTimelineUrl } from "../../utils/helper.ts";

/** The collapsible list of the users, linking to their timelines. */
export function SidebarUsersMenu({
  selectedUsername,
  users,
}: {
  selectedUsername?: string;
  users: Array<SidebarUser>;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <nav aria-label="Utilisateurs">
          <SidebarMenu>
            <Collapsible defaultOpen asChild className="tw:group/users">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="tw:font-medium">
                    Utilisateurs
                    <ChevronRightIcon className="tw:ml-auto tw:transition-transform tw:group-data-[state=open]/users:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {users.map((user) => (
                      <SidebarMenuSubItem key={user.username}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={user.username === selectedUsername}
                          className="tw:h-11"
                        >
                          <a
                            href={getUserTimelineUrl(user.username)}
                            aria-current={user.username === selectedUsername ? "page" : undefined}
                          >
                            <Avatar>
                              <AvatarImage src={user.avatarPath} alt="" />
                              <AvatarFallback>{formatUserInitials(user.username)}</AvatarFallback>
                            </Avatar>
                            <span>{formatUserHandle(user.username)}</span>
                          </a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </nav>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
