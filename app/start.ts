import process from "node:process";
import { createMiddleware, createStart } from "@tanstack/react-start";
import { readBasicAuthPassword, rejectWithoutBasicAuth } from "./basic-auth.ts";

const basicAuth = createMiddleware().server(
  async ({ request, next }) =>
    rejectWithoutBasicAuth(request, readBasicAuthPassword(process.env)) ?? (await next()),
);

export const startInstance = createStart(() => ({
  requestMiddleware: [basicAuth],
}));
