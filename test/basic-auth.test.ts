import { Buffer } from "node:buffer";
import { expect, test } from "vitest";
import { readBasicAuthPassword, rejectWithoutBasicAuth } from "../app/basic-auth.ts";

const password = readBasicAuthPassword({ DEMO_BASIC_AUTH_PASSWORD: "s3cret" });

function requestWith(authorization?: string): Request {
  return new globalThis.Request("http://demo.test/report", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

function basic(username: string, sentPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${sentPassword}`).toString("base64")}`;
}

test("a request without credentials gets a basic auth challenge", () => {
  const response = rejectWithoutBasicAuth(requestWith(), password);

  expect(response?.status).toBe(401);
  expect(response?.headers.get("www-authenticate")).toMatch(/^Basic realm=/u);
});

test("a request with the wrong password gets a basic auth challenge", () => {
  const response = rejectWithoutBasicAuth(requestWith(basic("reviewer", "guess")), password);

  expect(response?.status).toBe(401);
});

test.for(["reviewer", ""])(
  "a request with the password goes through, whatever the username (%j)",
  (username) => {
    expect(
      rejectWithoutBasicAuth(requestWith(basic(username, "s3cret")), password),
    ).toBeUndefined();
  },
);

test("with no password configured, every request goes through", () => {
  const unconfigured = readBasicAuthPassword({});

  expect(unconfigured).toBeUndefined();
  expect(rejectWithoutBasicAuth(requestWith(), unconfigured)).toBeUndefined();
});
