import { useState } from "react";

export function useScrollingTitle() {
  const [distance, setDistance] = useState(0);
  const [attach] = useState(
    () =>
      function bindTitle(node: HTMLParagraphElement | null) {
        let observer: ResizeObserver | undefined;
        const text = node?.firstElementChild;
        function measure() {
          setDistance(Math.max(0, (text?.scrollWidth ?? 0) - (node?.clientWidth ?? 0)));
        }
        if (node !== null) {
          measure();
          if (Object.hasOwn(globalThis, "ResizeObserver")) {
            observer = new globalThis.ResizeObserver(measure);
            observer.observe(node);
            if (text !== null && text !== undefined) {
              observer.observe(text);
            }
          }
        }
        return () => {
          observer?.disconnect();
        };
      },
  );
  return { attach, distance };
}
