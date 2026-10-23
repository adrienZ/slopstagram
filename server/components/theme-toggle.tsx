import { MoonIcon, SunIcon, MonitorIcon } from "lucide-react";
import { useTheme } from "./theme-provider.tsx";
import { Button } from "../shadcn/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../shadcn/ui/dropdown-menu.tsx";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const ThemeIcon = { light: SunIcon, dark: MoonIcon, system: MonitorIcon }[theme];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="tw:w-full tw:justify-start"
          aria-label="Choisir le thème"
        >
          <ThemeIcon data-icon="inline-start" />
          Thème
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <SunIcon />
            Clair
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon />
            Sombre
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon />
            Système
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
