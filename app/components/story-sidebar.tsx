import { useTranslation } from "react-i18next";
import type { Matcher } from "react-day-picker";
import { useState } from "react";
import { fr } from "react-day-picker/locale";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  MapIcon,
  MessageCircleIcon,
  WaypointsIcon,
} from "lucide-react";
import { formatStoryDay, STORY_TIME_ZONE } from "@@/core/domains/story-feed/story-days.ts";
import { Button } from "../shadcn/ui/button.tsx";
import { Calendar } from "../shadcn/ui/calendar.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { formatUserHandle, formatUserInitials, getUserTimelineUrl } from "../utils/helper.ts";
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
  oldestDate: string;
  today: string;
  onSelectDate: (date: Date) => void;
  disabledDates?: Array<Matcher>;
  users: Array<SidebarUser>;
  selectedUsername?: string;
}

const NO_DISABLED_DATES: Array<Matcher> = [];

export function StorySidebar({
  selectedDate,
  oldestDate,
  today,
  onSelectDate,
  disabledDates = NO_DISABLED_DATES,
  users,
  selectedUsername,
}: StorySidebarProps) {
  const { setOpenMobile } = useSidebar();
  const { t } = useTranslation();
  const [month, setMonth] = useState(new Date(`${selectedDate}T12:00:00Z`));
  const todayDate = new Date(`${today}T12:00:00Z`);

  function selectDate(date: Date) {
    setMonth(date);
    setOpenMobile(false);
    onSelectDate(date);
  }

  return (
    <Sidebar aria-label={t("sidebar.label")}>
      <SidebarHeader className="tw:p-5">
        <a href="/report" className="tw:flex tw:items-center tw:gap-3 tw:no-underline">
          <span className="tw:flex tw:size-9 tw:items-center tw:justify-center tw:rounded-lg tw:bg-sidebar-primary tw:text-sidebar-primary-foreground">
            <CalendarDaysIcon className="tw:size-5" />
          </span>
          <div className="tw:grid tw:gap-0.5">
            <span className="tw:text-sm tw:font-semibold">Slopstagram</span>
            <span className="tw:text-xs tw:text-muted-foreground">{t("sidebar.tagline")}</span>
          </div>
        </a>
      </SidebarHeader>
      <SidebarSeparator className="tw:data-horizontal:w-auto" />
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
              startMonth={new Date(`${oldestDate}T12:00:00Z`)}
              endMonth={todayDate}
              onSelect={selectDate}
              className="tw:w-full tw:bg-transparent tw:[--cell-size:1.9rem]"
              classNames={{ today: "tw:rounded-md tw:ring-1 tw:ring-primary tw:ring-inset" }}
            />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="tw:data-horizontal:w-auto" />
        <SidebarGroup>
          <Button
            variant="outline"
            onClick={() => {
              selectDate(todayDate);
            }}
          >
            {t("sidebar.today", { day: formatStoryDay(today) })}
          </Button>
        </SidebarGroup>
        <SidebarSeparator className="tw:data-horizontal:w-auto" />
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label={t("sidebar.pages")}>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/chat">
                      <MessageCircleIcon aria-hidden="true" />
                      <span>{t("common.assistant")}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/map">
                      <MapIcon aria-hidden="true" />
                      <span>{t("common.map")}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/graph">
                      <WaypointsIcon aria-hidden="true" />
                      <span>{t("common.graph")}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="tw:data-horizontal:w-auto" />
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label={t("common.users")}>
              <SidebarMenu>
                <Collapsible defaultOpen asChild className="tw:group/users">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton>
                        <span className="tw:font-medium">{t("common.users")}</span>
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
                                  <AvatarImage src={user.avatarPath} alt="" />
                                  <AvatarFallback>
                                    {formatUserInitials(user.username)}
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
