import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { requestWithRetry } from "@@/core/domains/instagram/story-retry.ts";
import type { InstagramClientResponse } from "@@/core/domains/instagram/instagram-types.ts";
import { createMockLogger, fixedNow, response } from "./mock-helpers.ts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(fixedNow());
  // Jitter adds Math.floor(0.5 * 100) = 50ms to every backoff.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Runs the request with fake timers and returns the waits between attempts. */
async function runWithRetry<T>(
  runRequest: () => Promise<InstagramClientResponse<T>>,
  maxAttempts = 3,
) {
  const attemptTimes: Array<number> = [];
  const pending = requestWithRetry(
    async () => {
      attemptTimes.push(Date.now());
      return await runRequest();
    },
    { logger: createMockLogger(), maxAttempts, now: fixedNow },
    "stories",
  );
  await vi.runAllTimersAsync();
  const result = await pending;
  const delays = attemptTimes.slice(1).map((time, index) => time - attemptTimes[index]);
  return { delays, result };
}

test("retries transient HTTP failures with exponential backoff and jitter", async () => {
  let attempts = 0;
  const { delays, result } = await runWithRetry(async () => {
    attempts += 1;
    return attempts < 3 ? response("unavailable", 503) : response("recovered");
  });

  expect(result).toStrictEqual({ ok: true, value: "recovered" });
  expect(attempts).toBe(3);
  expect(delays).toStrictEqual([550, 1050]);
});

const retryAfterCases: Array<{ name: string; headers: Record<string, string>; delay: number }> = [
  { name: "seconds", headers: { "Retry-After": "2" }, delay: 2000 },
  { name: "capped seconds", headers: { "Retry-After": "30" }, delay: 10_000 },
  { name: "negative seconds", headers: { "Retry-After": "-1" }, delay: 0 },
  { name: "HTTP date", headers: { "Retry-After": "Sun, 26 Jul 2026 00:00:03 GMT" }, delay: 3000 },
  { name: "past HTTP date", headers: { "Retry-After": "Sat, 25 Jul 2026 23:59:59 GMT" }, delay: 0 },
  { name: "invalid header", headers: { "Retry-After": "invalid" }, delay: 550 },
  { name: "missing header", headers: {}, delay: 550 },
];

for (const entry of retryAfterCases) {
  test(`handles rate limiting with ${entry.name}`, async () => {
    let attempts = 0;
    const { delays, result } = await runWithRetry(async () => {
      attempts += 1;
      return attempts === 1 ? response("limited", 429, entry.headers) : response("recovered");
    });

    expect(result).toStrictEqual({ ok: true, value: "recovered" });
    expect(attempts).toBe(2);
    expect(delays).toStrictEqual([entry.delay]);
  });
}

test("does not retry permanent HTTP failures", async () => {
  let attempts = 0;
  const { delays, result } = await runWithRetry(async () => {
    attempts += 1;
    return response(null, 403);
  });

  expect(result).toStrictEqual({
    ok: false,
    failure: {
      attemptCount: 1,
      message: "Instagram request failed with HTTP 403",
      reason: "request_failed",
      status: 403,
    },
  });
  expect(attempts).toBe(1);
  expect(delays).toStrictEqual([]);
});

test("stops retrying rate limits at the configured attempt limit", async () => {
  let attempts = 0;
  const { delays, result } = await runWithRetry(async () => {
    attempts += 1;
    return response(null, 429);
  }, 2);

  expect(result).toStrictEqual({
    ok: false,
    failure: {
      attemptCount: 2,
      message: "Instagram request failed with HTTP 429",
      reason: "rate_limited",
      status: 429,
    },
  });
  expect(attempts).toBe(2);
  expect(delays).toStrictEqual([550]);
});

test("retries thrown network failures before recovering", async () => {
  let attempts = 0;
  const { delays, result } = await runWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("connection reset");
    }
    return response("recovered");
  });

  expect(result).toStrictEqual({ ok: true, value: "recovered" });
  expect(attempts).toBe(2);
  expect(delays).toStrictEqual([550]);
});

test("reports the final thrown failure after exhausting retries", async () => {
  let attempts = 0;
  const { delays, result } = await runWithRetry(async () => {
    attempts += 1;
    throw new Error(`connection reset ${attempts}`);
  }, 2);

  expect(result).toStrictEqual({
    ok: false,
    failure: {
      attemptCount: 2,
      message: "connection reset 2",
      reason: "request_failed",
      status: null,
    },
  });
  expect(attempts).toBe(2);
  expect(delays).toStrictEqual([550]);
});

test("does not retry errors marked non-retryable", async () => {
  let attempts = 0;
  const { delays, result } = await runWithRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error("session expired"), { nonRetryable: true });
  });

  expect(result).toStrictEqual({
    ok: false,
    failure: {
      attemptCount: 1,
      message: "session expired",
      reason: "request_failed",
      status: null,
    },
  });
  expect(attempts).toBe(1);
  expect(delays).toStrictEqual([]);
});
