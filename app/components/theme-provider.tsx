import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { ScriptOnce } from "@tanstack/react-router";
import {
  getServerTheme,
  getThemeSnapshot,
  setTheme,
  subscribeTheme,
  themeScript,
  type Theme,
} from "../theme.ts";

const ThemeContext = createContext<{ theme: Theme; setTheme: typeof setTheme } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerTheme);
  return (
    <ThemeContext value={{ theme, setTheme }}>
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
