import { test, expect } from "vitest";
import { requestWithRetry, type RetryOptions } from "../sdk/story-retry-service.ts";
import { createMockLogger, fixedNow, response } from "./mock-helpers.ts";

function retryOptions(overrides: Partial<RetryOptions> = {}) {
  const delays: Array<number> = [];
  const options: RetryOptions = {
    baseDelayMs: 100,
    logger: createMockLogger(),
    maxAttempts: 3,
    maxRateLimitDelayMs: 5000,
    now: fixedNow,
    random: () => 0.5,
    sleep: async (durationMs) => {
      delays.push(durationMs);
    },
    ...overrides,
  };
  return { delays, options };
}

test("retries transient HTTP failures with exponential backoff and jitter", async () => {
  const { delays, options } = retryOptions();
  let attempts = 0;
  const result = await requestWithRetry(
    async () => {
      attempts += 1;
      return attempts < 3 ? response("unavailable", 503) : response("recovered");
    },
    options,
    "stories",
  );

  expect(result).toStrictEqual({ ok: true, value: "recovered" });
  expect(attempts).toBe(3);
  expect(delays).toStrictEqual([150, 250]);
});

const retryAfterCases: Array<{ name: string; headers: Record<string, string>; delay: number }> = [
  { name: "seconds", headers: { "Retry-After": "2" }, delay: 2000 },
  { name: "capped seconds", headers: { "Retry-After": "30" }, delay: 5000 },
  { name: "negative seconds", headers: { "Retry-After": "-1" }, delay: 0 },
  { name: "HTTP date", headers: { "Retry-After": "Sun, 26 Jul 2026 00:00:03 GMT" }, delay: 3000 },
  { name: "past HTTP date", headers: { "Retry-After": "Sat, 25 Jul 2026 23:59:59 GMT" }, delay: 0 },
  { name: "invalid header", headers: { "Retry-After": "invalid" }, delay: 150 },
  { name: "missing header", headers: {}, delay: 150 },
];

for (const entry of retryAfterCases) {
  test(`handles rate limiting with ${entry.name}`, async () => {
    const { delays, options } = retryOptions();
    let attempts = 0;
    const result = await requestWithRetry(
      async () => {
        attempts += 1;
        return attempts === 1 ? response("limited", 429, entry.headers) : response("recovered");
      },
      options,
      "stories",
    );

    expect(result).toStrictEqual({ ok: true, value: "recovered" });
    expect(attempts).toBe(2);
    expect(delays).toStrictEqual([entry.delay]);
  });
}

test("does not retry permanent HTTP failures", async () => {
  const { delays, options } = retryOptions();
  let attempts = 0;
  const result = await requestWithRetry(
    async () => {
      attempts += 1;
      return response(null, 403);
    },
    options,
    "stories",
  );

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
  const { delays, options } = retryOptions({ maxAttempts: 2 });
  let attempts = 0;
  const result = await requestWithRetry(
    async () => {
      attempts += 1;
      return response(null, 429);
    },
    options,
    "stories",
  );

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
  expect(delays).toStrictEqual([150]);
});

test("retries thrown network failures before recovering", async () => {
  const { delays, options } = retryOptions();
  let attempts = 0;
  const result = await requestWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("connection reset");
      }
      return response("recovered");
    },
    options,
    "stories",
  );

  expect(result).toStrictEqual({ ok: true, value: "recovered" });
  expect(attempts).toBe(2);
  expect(delays).toStrictEqual([150]);
});

test("reports the final thrown failure after exhausting retries", async () => {
  const { delays, options } = retryOptions({ maxAttempts: 2 });
  let attempts = 0;
  const result = await requestWithRetry(
    async () => {
      attempts += 1;
      throw new Error(`connection reset ${attempts}`);
    },
    options,
    "stories",
  );

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
  expect(delays).toStrictEqual([150]);
});

test("does not retry errors marked non-retryable", async () => {
  const { delays, options } = retryOptions();
  let attempts = 0;
  const result = await requestWithRetry(
    async () => {
      attempts += 1;
      throw Object.assign(new Error("session expired"), { nonRetryable: true });
    },
    options,
    "stories",
  );

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
