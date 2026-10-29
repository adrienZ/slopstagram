import { test, expect } from "vitest";
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
    const audioPreview = await server.ssrLoadModule("/server/hooks/use-audio-preview.ts");
    const timelineCalendar = await server.ssrLoadModule("/server/hooks/use-timeline-calendar.ts");
    expect(Object.keys(audioPreview)).toStrictEqual(["useAudioPreview"]);
    expect(Object.keys(timelineCalendar)).toStrictEqual(["useTimelineCalendar"]);
  } finally {
    await server.close();
  }
});
