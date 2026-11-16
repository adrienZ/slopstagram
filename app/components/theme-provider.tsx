import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { ScriptOnce } from "@tanstack/react-router";
import {
  getServerTheme,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  themeScript,
  type Theme,
} from "./theme.ts";

const ThemeContext = createContext<{ theme: Theme; setTheme: typeof setTheme } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerTheme);
  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <ThemeContext value={value}>
      <ScriptOnce>{themeScript}</ScriptOnce>
      {children}
    </ThemeContext>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
