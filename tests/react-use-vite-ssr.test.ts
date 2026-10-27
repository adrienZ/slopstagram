import { test } from "vitest";
import { createServer } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import appConfig from "../vite.config.ts";

test("Vite SSR loads both react-use application hooks", async (context) => {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "react-use-vite-"));
  context.onTestFinished(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });
  const server = await createServer({
    configFile: false,
    cacheDir,
    logLevel: "silent",
    resolve: { tsconfigPaths: true },
    ssr: appConfig.ssr,
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  });
  try {
    await server.ssrLoadModule("/server/hooks/use-audio-preview.ts");
    await server.ssrLoadModule("/server/hooks/use-timeline-calendar.ts");
  } finally {
    await server.close();
  }
});
