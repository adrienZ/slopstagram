import { z } from "zod";

const themeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof themeSchema>;
const storageKey = "slopstagram-theme";
const themeChangeEvent = "slopstagram-theme-change";
let currentTheme: Theme | undefined;

export const themeScript = `(function(){var mode='system';try{var saved=localStorage.getItem('${storageKey}');if(saved==='dark'||saved==='light')mode=saved}catch(e){}var dark=mode==='dark'||(mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var root=document.documentElement;root.classList.toggle('dark',dark);root.classList.toggle('light',!dark);root.style.colorScheme=dark?'dark':'light'})()`;

function readStoredTheme(): Theme {
  try {
    return themeSchema.safeParse(globalThis.localStorage.getItem(storageKey)).data ?? "system";
  } catch {
    return "system";
  }
}

export function getThemeSnapshot(): Theme {
  currentTheme ??= readStoredTheme();
  return currentTheme;
}

export function getServerTheme(): Theme {
  return "system";
}

function applyTheme(theme: Theme): void {
  const dark =
    theme === "dark" ||
    (theme === "system" && globalThis.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = globalThis.document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(value: string): void {
  const theme = themeSchema.parse(value);
  currentTheme = theme;
  try {
    globalThis.localStorage.setItem(storageKey, theme);
  } catch {
    // Keep the selected theme for this page when browser storage is unavailable.
  }
  applyTheme(theme);
  globalThis.dispatchEvent(new globalThis.Event(themeChangeEvent));
}

export function subscribeTheme(listener: () => void): () => void {
  const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
  function updateTheme() {
    applyTheme(getThemeSnapshot());
    listener();
  }
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) {
      currentTheme = readStoredTheme();
      updateTheme();
    }
  }
  updateTheme();
  globalThis.addEventListener(themeChangeEvent, updateTheme);
  globalThis.addEventListener("storage", onStorage);
  media.addEventListener("change", updateTheme);
  return () => {
    globalThis.removeEventListener(themeChangeEvent, updateTheme);
    globalThis.removeEventListener("storage", onStorage);
    media.removeEventListener("change", updateTheme);
  };
}
