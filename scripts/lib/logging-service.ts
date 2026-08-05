import { ProgressBar } from "@opentf/cli-pbar";
import { createConsola } from "consola";
import type { ConsolaReporter } from "consola";

export type Logger = {
  debug: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  progress: (label: string, current: number, total: number) => void;
  warn: (message: string) => void;
};

const stderrReporter: ConsolaReporter = {
  log: ({ args, tag, type }) => {
    process.stderr.write(`${tag ? `[${tag}] ` : ""}${type}: ${args.join(" ")}\n`);
  },
};

export function createLogger(prefix: string): Logger {
  const logger = createConsola({ reporters: [stderrReporter] }).withTag(prefix);
  let progressBar: ProgressBar | null = null;
  let progressLabel = "";

  return {
    debug: (message) => logger.debug(message),
    error: (message) => logger.error(message),
    info: (message) => logger.info(message),
    progress: (label, current, total) => {
      if (!progressBar || progressLabel !== label) {
        progressBar?.stop();
        progressBar = new ProgressBar({
          autoClear: true,
          prefix: `[${prefix}] ${label}`,
          showCount: true,
        });
        progressBar.start({ total });
        progressLabel = label;
      }

      progressBar.update({ total, value: current });

      if (current >= total) {
        progressBar.stop();
        progressBar = null;
        progressLabel = "";
      }
    },
    warn: (message) => logger.warn(message),
  };
}

export const noopLogger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  progress: () => {},
  warn: () => {},
};
