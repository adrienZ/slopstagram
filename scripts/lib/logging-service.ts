export type LogLevel = "debug" | "error" | "info" | "warn";

export type Logger = {
  debug: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  progress: (label: string, current: number, total: number) => void;
  warn: (message: string) => void;
};

type LogWriter = (message: string) => void;

function formatMessage(prefix: string, level: LogLevel, message: string): string {
  return `[${prefix}] ${level}: ${message}`;
}

export function formatProgressBar(current: number, total: number): string {
  const width = 20;
  const boundedTotal = Math.max(0, total);
  const boundedCurrent =
    boundedTotal === 0 ? 0 : Math.min(Math.max(0, current), boundedTotal);
  const ratio = boundedTotal === 0 ? 1 : boundedCurrent / boundedTotal;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const percent = Math.round(ratio * 100);

  return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${boundedCurrent}/${boundedTotal} ${percent}%`;
}

export function createLogger(
  prefix: string,
  write: LogWriter = console.log,
): Logger {
  return {
    debug: (message) => write(formatMessage(prefix, "debug", message)),
    error: (message) => write(formatMessage(prefix, "error", message)),
    info: (message) => write(formatMessage(prefix, "info", message)),
    progress: (label, current, total) =>
      write(
        formatMessage(
          prefix,
          "info",
          `${label} ${formatProgressBar(current, total)}`,
        ),
      ),
    warn: (message) => write(formatMessage(prefix, "warn", message)),
  };
}

export const noopLogger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  progress: () => {},
  warn: () => {},
};
