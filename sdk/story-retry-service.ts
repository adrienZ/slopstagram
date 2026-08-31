import { setTimeout } from "node:timers";
import type { Logger } from "./lib/logging-service.ts";
import type { InstagramClientResponse } from "./stories.ts";

export type RequestFailure = {
  attemptCount: number;
  message: string;
  reason: "request_failed" | "rate_limited";
  status: number | null;
};

export type RequestResult<T> =
  | {
      value: T;
      ok: true;
    }
  | {
      failure: RequestFailure;
      ok: false;
    };

export type RetryOptions = {
  baseDelayMs: number;
  logger: Logger;
  maxAttempts: number;
  maxRateLimitDelayMs: number;
  now: () => Date;
  random: () => number;
  sleep: (durationMs: number) => Promise<void>;
};

const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function getRetryAfterMs(
  headers: Record<string, string>,
  maxRateLimitDelayMs: number,
  now: Date,
): number | null {
  const retryAfter = normalizeHeaders(headers)["retry-after"];

  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(0, seconds * 1000), maxRateLimitDelayMs);
  }

  const retryAt = Date.parse(retryAfter);
  return Number.isNaN(retryAt)
    ? null
    : Math.min(Math.max(0, retryAt - now.getTime()), maxRateLimitDelayMs);
}

function getBackoffMs(
  attemptIndex: number,
  response: InstagramClientResponse<unknown> | null,
  options: RetryOptions,
): number {
  const retryAfterMs =
    response?.status === 429
      ? getRetryAfterMs(response.headers, options.maxRateLimitDelayMs, options.now())
      : null;

  return (
    retryAfterMs ?? options.baseDelayMs * 2 ** attemptIndex + Math.floor(options.random() * 100)
  );
}

function createHttpFailure(
  response: InstagramClientResponse<unknown>,
  attemptCount: number,
): RequestFailure {
  return {
    attemptCount,
    message: `Instagram request failed with HTTP ${response.status}`,
    reason: response.status === 429 ? "rate_limited" : "request_failed",
    status: response.status,
  };
}

function createThrownFailure(error: Error, attemptCount: number): RequestFailure {
  return {
    attemptCount,
    message: error.message,
    reason: "request_failed",
    status: null,
  };
}

function isNonRetryableError(error: Error): boolean {
  return "nonRetryable" in error && error.nonRetryable === true;
}

async function handleFailedResponse<T>(
  response: InstagramClientResponse<T>,
  attemptIndex: number,
  options: RetryOptions,
  label: string,
): Promise<RequestResult<T> | null> {
  const attemptCount = attemptIndex + 1;
  const failure = createHttpFailure(response, attemptCount);

  if (attemptCount >= options.maxAttempts || !TRANSIENT_STATUS_CODES.has(response.status)) {
    options.logger.warn(`${label} failed after ${attemptCount} attempt(s): ${failure.message}`);
    return { failure, ok: false };
  }

  const delayMs = getBackoffMs(attemptIndex, response, options);
  options.logger.warn(
    `${label} attempt ${attemptCount} failed with HTTP ${response.status}; retrying in ${delayMs}ms`,
  );
  await options.sleep(delayMs);
  return null;
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters https://typescript-eslint.io/rules/no-unnecessary-type-parameters/#the-return-type-is-only-used-as-an-input-so-why-isnt-the-rule-reporting
async function handleThrownRequest<T>(
  error: Error,
  attemptIndex: number,
  options: RetryOptions,
  label: string,
): Promise<RequestResult<T> | null> {
  const attemptCount = attemptIndex + 1;
  const failure = createThrownFailure(error, attemptCount);

  if (attemptCount >= options.maxAttempts || isNonRetryableError(error)) {
    options.logger.warn(`${label} failed after ${attemptCount} attempt(s): ${failure.message}`);
    return { failure, ok: false };
  }

  const delayMs = getBackoffMs(attemptIndex, null, options);
  options.logger.warn(
    `${label} attempt ${attemptCount} threw ${failure.message}; retrying in ${delayMs}ms`,
  );
  await options.sleep(delayMs);
  return null;
}

export async function requestWithRetry<T>(
  runRequest: () => Promise<InstagramClientResponse<T>>,
  options: RetryOptions,
  label: string,
): Promise<RequestResult<T>> {
  let lastFailure: RequestFailure = {
    attemptCount: 0,
    message: "Request was not attempted",
    reason: "request_failed",
    status: null,
  };

  for (let attemptIndex = 0; attemptIndex < options.maxAttempts; attemptIndex += 1) {
    try {
      const response = await runRequest();
      if (response.ok) {
        return { ok: true, value: await response.json() };
      }
      lastFailure = createHttpFailure(response, attemptIndex + 1);
      const result = await handleFailedResponse(response, attemptIndex, options, label);
      if (result !== null) {
        return result;
      }
    } catch (error) {
      const requestError = error instanceof Error ? error : new Error("request failed");
      lastFailure = createThrownFailure(requestError, attemptIndex + 1);
      const result = await handleThrownRequest<T>(requestError, attemptIndex, options, label);
      if (result !== null) {
        return result;
      }
    }
  }

  return { failure: lastFailure, ok: false };
}
