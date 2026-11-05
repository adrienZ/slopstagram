import { useSyncExternalStore } from "react";

function getMediaQueryList(query: string) {
  // Missing on the server and in jsdom.
  return "matchMedia" in globalThis ? globalThis.matchMedia(query) : undefined;
}

/** Whether the media query matches; false where `matchMedia` is missing. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = getMediaQueryList(query);
      list?.addEventListener("change", onChange);
      return () => {
        list?.removeEventListener("change", onChange);
      };
    },
    () => getMediaQueryList(query)?.matches ?? false,
    () => false,
  );
}
