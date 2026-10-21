type IconName =
  | "arrow"
  | "attach"
  | "check"
  | "chevron"
  | "close"
  | "copy"
  | "edit"
  | "globe"
  | "lightbulb"
  | "message"
  | "panel"
  | "search"
  | "spark"
  | "stop"
  | "refresh";

const paths: Record<IconName, string> = {
  arrow: "M12 19V5m-6 6 6-6 6 6",
  attach: "m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8m-5 12 8-8",
  check: "m5 12 4 4L19 6",
  chevron: "m8 10 4 4 4-4",
  close: "m6 6 12 12M6 18 18 6",
  copy: "M9 9h11v11H9zM5 15H3V3h12v2",
  edit: "m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  lightbulb: "M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 2H9l-1-2Z",
  message: "M20 11a8 8 0 0 1-8 8H4l-2 3V11a9 9 0 0 1 18 0Z",
  panel: "M3 4h18v16H3zM9 4v16",
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  spark: "m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z",
  stop: "M6 6h12v12H6z",
  refresh: "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3",
};

export function ChatIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
