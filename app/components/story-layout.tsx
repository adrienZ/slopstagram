import type { ReactNode } from "react";
import { StorySidebar, type StorySidebarProps } from "./story-sidebar.tsx";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../shadcn/ui/sidebar.tsx";
import { TooltipProvider } from "../shadcn/ui/tooltip.tsx";

export function StoryLayout({
  children,
  title,
  ...sidebarProps
}: StorySidebarProps & { children: ReactNode; title: string }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <StorySidebar {...sidebarProps} />
        <SidebarInset className="tw:min-w-0">
          <header className="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-3 tw:border-b tw:px-4">
            <SidebarTrigger aria-label="Afficher ou masquer le calendrier" />
            <span className="tw:min-w-0 tw:truncate tw:text-sm tw:text-muted-foreground">
              {title}
            </span>
          </header>
          <div className="tw:mx-auto tw:w-full tw:max-w-360 tw:px-6 tw:pt-8 tw:pb-12 tw:max-[760px]:px-4 tw:max-[760px]:py-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
