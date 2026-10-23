import type { Matcher } from "react-day-picker";
import { useState } from "react";
import { fr } from "react-day-picker/locale";
import { CalendarDaysIcon, ChevronRightIcon } from "lucide-react";
import { formatStoryDay, STORY_TIME_ZONE } from "../../sdk/lib/story-date-service.ts";
import { Button } from "../shadcn/ui/button.tsx";
import { Calendar } from "../shadcn/ui/calendar.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import type { SidebarUser } from "../sidebar-users.ts";
import { formatUserHandle, getUserTimelineUrl } from "../helper.ts";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../shadcn/ui/collapsible.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarSeparator,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "../shadcn/ui/sidebar.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

export interface StorySidebarProps {
  selectedDate: string;
  today: string;
  onSelectDate: (date: Date) => void;
  disabledDates?: Array<Matcher>;
  users: Array<SidebarUser>;
  selectedUsername?: string;
}

export function StorySidebar({
  selectedDate,
  today,
  onSelectDate,
  disabledDates = [],
  users,
  selectedUsername,
}: StorySidebarProps) {
  const { setOpenMobile } = useSidebar();
  const [month, setMonth] = useState(new Date(`${selectedDate}T12:00:00Z`));
  const todayDate = new Date(`${today}T12:00:00Z`);

  function selectDate(date: Date) {
    setMonth(date);
    setOpenMobile(false);
    onSelectDate(date);
  }

  return (
    <Sidebar aria-label="Navigation des stories">
      <SidebarHeader className="tw:p-5">
        <a href="/report" className="tw:flex tw:items-center tw:gap-3 tw:no-underline">
          <span className="tw:flex tw:size-9 tw:items-center tw:justify-center tw:rounded-lg tw:bg-sidebar-primary tw:text-sidebar-primary-foreground">
            <CalendarDaysIcon className="tw:size-5" />
          </span>
          <div className="tw:grid tw:gap-0.5">
            <span className="tw:text-sm tw:font-semibold">Slopstagram</span>
            <span className="tw:text-xs tw:text-muted-foreground">Le fil des stories</span>
          </div>
        </a>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup className="tw:px-2 tw:py-4">
          <SidebarGroupContent>
            <Calendar
              mode="single"
              required
              locale={fr}
              timeZone={STORY_TIME_ZONE}
              selected={new Date(`${selectedDate}T12:00:00Z`)}
              month={month}
              onMonthChange={setMonth}
              today={todayDate}
              disabled={[{ after: todayDate }, ...disabledDates]}
              endMonth={todayDate}
              onSelect={selectDate}
              className="tw:w-full tw:bg-transparent tw:[--cell-size:1.9rem]"
              classNames={{ today: "tw:rounded-md tw:ring-1 tw:ring-primary tw:ring-inset" }}
            />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <Button
            variant="outline"
            onClick={() => {
              selectDate(todayDate);
            }}
          >
            {`Aujourd’hui · ${formatStoryDay(today)}`}
          </Button>
        </SidebarGroup>
        <SidebarSeparator />
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
                                aria-current={
                                  user.username === selectedUsername ? "page" : undefined
                                }
                              >
                                <Avatar>
                                  <AvatarImage src={user.avatarPath ?? undefined} alt="" />
                                  <AvatarFallback>
                                    {user.username.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
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
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  );
}
