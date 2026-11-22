import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

// Network boundary of a test file: a request without a handler fails instead of reaching the network.
export function createMockServer() {
  const server = setupServer();

  beforeAll(() => {
    server.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });

  return server;
}
