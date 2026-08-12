import process from "node:process";
import { setTimeout } from "node:timers";
import { pathToFileURL } from "node:url";
import { createReport } from "../sdk/index.ts";
import { createLogger, type Logger } from "../sdk/lib/logging-service.ts";

type FeedCacheArgs = {
  intervalMs: number;
  once: boolean;
  reportArgs: string[];
};

type FeedCacheOptions = {
  args?: string[];
  createReport?: typeof createReport;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

function parsePositiveNumber(value: string, optionName: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive number`);
  }

  return parsed;
}

function readOptionValue(args: string[], index: number, optionName: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value`);
  }

  return value;
}

export function parseFeedCacheArgs(args: string[]): FeedCacheArgs {
  const reportArgs: string[] = [];
  let intervalMs = DEFAULT_INTERVAL_MS;
  let once = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      reportArgs.push(...args.slice(index + 1));
      break;
    }

    if (arg === "--once") {
      once = true;
      continue;
    }

    if (arg === "--interval-ms") {
      intervalMs = parsePositiveNumber(readOptionValue(args, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg === "--interval-minutes") {
      intervalMs = parsePositiveNumber(readOptionValue(args, index, arg), arg) * 60 * 1000;
      index += 1;
      continue;
    }

    reportArgs.push(arg);
  }

  return {
    intervalMs,
    once,
    reportArgs,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatInterval(intervalMs: number): string {
  const minutes = intervalMs / 60 / 1000;

  return Number.isInteger(minutes) ? `${minutes}m` : `${intervalMs}ms`;
}

export async function feedCache(options: FeedCacheOptions): Promise<void> {
  const args = parseFeedCacheArgs(options.args ?? []);
  const runCreateReport = options.createReport ?? createReport;
  const sleep = options.sleep ?? defaultSleep;
  const logger = options.logger;
  let runNumber = 0;
  let shouldContinue = true;

  logger.info(
    `starting cache feed interval=${formatInterval(args.intervalMs)}${
      args.once ? " mode=once" : ""
    }`,
  );

  while (shouldContinue) {
    runNumber += 1;
    logger.info(`cache feed run ${runNumber} started`);
    const result = await runCreateReport({
      args: args.reportArgs,
      logger,
    });
    logger.success(`cache feed run ${runNumber} wrote ${result.outputFileName}`);

    if (args.once) {
      shouldContinue = false;
      continue;
    }

    logger.info(`next cache feed run in ${formatInterval(args.intervalMs)}`);
    await sleep(args.intervalMs);
  }
}

async function main(): Promise<void> {
  await feedCache({
    args: process.argv.slice(2),
    logger: createLogger("feed-cache"),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
