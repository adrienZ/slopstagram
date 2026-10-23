import { expect, test, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import { ThemeToggle } from "../../server/components/theme-toggle.tsx";
import { renderContent } from "./render.tsx";

const storageKey = "slopstagram-theme";

test("theme choices persist, apply document colors, and update the trigger icon", async () => {
  const { user } = await renderContent(<ThemeToggle />);
  const trigger = screen.getByRole("button", { name: "Choisir le thème" });
  expect(trigger.querySelector("svg")).toHaveClass("lucide-monitor");
  await user.click(trigger);
  expect(screen.getByRole("menuitemradio", { name: "Système" })).toBeChecked();
  await user.click(screen.getByRole("menuitemradio", { name: "Sombre" }));
  expect(globalThis.localStorage.getItem(storageKey)).toBe("dark");
  expect(globalThis.document.documentElement).toHaveClass("dark");
  expect(globalThis.document.documentElement.style.colorScheme).toBe("dark");
  expect(trigger.querySelector("svg")).toHaveClass("lucide-moon");
  await user.click(trigger);
  expect(screen.getByRole("menuitemradio", { name: "Sombre" })).toBeChecked();
  await user.click(screen.getByRole("menuitemradio", { name: "Clair" }));
  expect(globalThis.document.documentElement).toHaveClass("light");
  expect(globalThis.localStorage.getItem(storageKey)).toBe("light");
  expect(trigger.querySelector("svg")).toHaveClass("lucide-sun");
  await user.click(trigger);
  await user.click(screen.getByRole("menuitemradio", { name: "Système" }));
  const preference = globalThis.matchMedia("(prefers-color-scheme: dark)");
  const matches = vi.spyOn(preference, "matches", "get");
  act(() => {
    matches.mockReturnValue(true);
    preference.dispatchEvent(new globalThis.Event("change"));
  });
  expect(globalThis.document.documentElement).toHaveClass("dark");
  expect(trigger.querySelector("svg")).toHaveClass("lucide-monitor");
  act(() => {
    matches.mockReturnValue(false);
    preference.dispatchEvent(new globalThis.Event("change"));
  });
  expect(globalThis.document.documentElement).toHaveClass("light");
});

test("cross-tab storage changes update the selected theme and clearing storage restores system", async () => {
  const { user } = await renderContent(<ThemeToggle />);
  act(() => {
    globalThis.localStorage.setItem(storageKey, "dark");
    globalThis.window.dispatchEvent(new globalThis.StorageEvent("storage", { key: storageKey }));
  });
  expect(globalThis.document.documentElement).toHaveClass("dark");
  act(() => {
    globalThis.localStorage.setItem("unrelated", "value");
    globalThis.window.dispatchEvent(new globalThis.StorageEvent("storage", { key: "unrelated" }));
  });
  expect(globalThis.document.documentElement).toHaveClass("dark");
  act(() => {
    globalThis.localStorage.clear();
    globalThis.window.dispatchEvent(new globalThis.StorageEvent("storage", { key: null }));
  });
  await user.click(screen.getByRole("button", { name: "Choisir le thème" }));
  expect(
    within(screen.getByRole("menu")).getByRole("menuitemradio", { name: "Système" }),
  ).toBeChecked();
});

test("theme selection still works when browser storage is blocked", async () => {
  vi.spyOn(globalThis.Storage.prototype, "getItem").mockImplementation(() => {
    throw new globalThis.DOMException("Blocked", "SecurityError");
  });
  vi.spyOn(globalThis.Storage.prototype, "setItem").mockImplementation(() => {
    throw new globalThis.DOMException("Blocked", "SecurityError");
  });
  const { user } = await renderContent(<ThemeToggle />);
  act(() => {
    globalThis.window.dispatchEvent(new globalThis.StorageEvent("storage", { key: storageKey }));
  });
  await user.click(screen.getByRole("button", { name: "Choisir le thème" }));
  expect(screen.getByRole("menuitemradio", { name: "Système" })).toBeChecked();
  await user.click(screen.getByRole("menuitemradio", { name: "Sombre" }));
  expect(globalThis.document.documentElement).toHaveClass("dark");
});
