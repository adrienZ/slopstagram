import { ProgressBar } from "@opentf/cli-pbar";
import { createConsola, type ConsolaInstance } from "consola";

type ProgressOptions = {
  prefix?: string;
  suffix?: string;
};

export type Logger = ConsolaInstance & {
  progress(value: number, total: number, options?: ProgressOptions): void;
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

export function createLogger(prefix: string): Logger {
  const instance = createConsola();
  instance.withTag(prefix);

  let activeBar: { bar: ProgressBar; key: string } | null = null;

  function stopActiveBar(): void {
    if (!activeBar) {
      return;
    }

    activeBar.bar.stop();
    activeBar = null;
  }

  for (const typeName of [
    "debug",
    "error",
    "info",
    "log",
    "success",
    "warn",
  ] as const) {
    const log = instance[typeName].bind(instance);
    instance[typeName] = ((...args: Parameters<typeof log>) => {
      stopActiveBar();
      return log(...args);
    }) as typeof instance[typeof typeName];
  }

  function progress(value: number, total: number, options: ProgressOptions = {}): void {
    if (!process.stderr.isTTY) {
      return;
    }

    const barPrefix = [prefix, options.prefix].filter(Boolean).join(" ");
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

export const noopLogger: Logger = createLogger("noop");
