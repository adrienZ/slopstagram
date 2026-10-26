import type { CSSProperties } from "react";
import { cn } from "cn";
import { useScrollingTitle } from "../hooks/use-scrolling-title.ts";

function Title({ children }: { children: string }) {
  const { attach, distance } = useScrollingTitle();
  const style: CSSProperties & {
    "--music-title-distance": string;
    "--music-title-duration": string;
  } = {
    "--music-title-distance": `${-distance}px`,
    "--music-title-duration": `${Math.max(8, distance / 24 + 4)}s`,
  };
  return (
    <p
      ref={attach}
      title={children}
      className="tw:min-w-0 tw:overflow-hidden tw:text-xs tw:font-medium"
    >
      <span
        className={cn(
          "tw:inline-block tw:min-w-full tw:whitespace-nowrap",
          distance > 0 &&
            "tw:animate-[music-title-scroll_var(--music-title-duration)_linear_infinite] tw:motion-reduce:animate-none",
        )}
        style={style}
      >
        {children}
      </span>
    </p>
  );
}

export function ScrollingTitle({ children }: { children: string }) {
  return <Title key={children}>{children}</Title>;
}
