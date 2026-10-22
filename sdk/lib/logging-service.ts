import process from "node:process";
import { ProgressBar } from "@opentf/cli-pbar";
import { createConsola, type ConsolaInstance } from "consola";

interface ProgressOptions {
  prefix?: string;
  suffix?: string;
}

export type Logger = ConsolaInstance & {
  progress: (value: number, total: number, options?: ProgressOptions) => void;
};

interface ActiveProgressBar {
  bar: ProgressBar;
  key: string;
}
type WrappedLogMethod = ((message?: string, ...args: Array<string>) => void) & {
  raw: (...args: Array<string>) => void;
};

function createBar(prefix: string): ProgressBar {
  return new ProgressBar({
    autoClear: true,
    prefix,
    showCount: true,
    variant: "PLAIN",
    size: "SMALL",
  });
}

function wrapLogMethod(log: WrappedLogMethod, stopActiveBar: () => void): WrappedLogMethod {
  return Object.assign(
    (message?: string, ...args: Array<string>) => {
      stopActiveBar();
      log(message, ...args);
    },
    {
      raw: (...args: Array<string>) => {
        stopActiveBar();
        log.raw(...args);
      },
    },
  );
}

function wrapLogMethods(instance: ConsolaInstance, stopActiveBar: () => void): void {
  for (const typeName of ["debug", "error", "info", "log", "success", "warn"] as const) {
    const log = Object.assign(instance[typeName].bind(instance), {
      raw: instance[typeName].raw.bind(instance),
    });
    instance[typeName] = wrapLogMethod(log, stopActiveBar);
  }
}

function getBarPrefix(prefix: string, options: ProgressOptions): string {
  return [prefix, options.prefix].filter(Boolean).join(" ");
}

export function createLogger(prefix: string): Logger {
  const instance = createConsola();
  instance.withTag(prefix);

  let activeBar: ActiveProgressBar | null = null;

  function stopActiveBar(): void {
    if (!activeBar) {
      return;
    }

    activeBar.bar.stop();
    activeBar = null;
  }

  wrapLogMethods(instance, stopActiveBar);

  function progress(value: number, total: number, options: ProgressOptions = {}): void {
    if (!process.stderr.isTTY) {
      return;
    }

    const barPrefix = getBarPrefix(prefix, options);
    const barKey = barPrefix;

    if (activeBar && activeBar.key !== barKey) {
      stopActiveBar();
    }

    if (!activeBar) {
      const bar = createBar(barPrefix);
      activeBar = { bar, key: barKey };
      bar.start({ total });
    }

    activeBar.bar.update({
      suffix: options.suffix,
      total,
      value,
    });

    if (value >= total) {
      stopActiveBar();
    }
  }

  return Object.assign(instance, {
    progress,
  });
}
