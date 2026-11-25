import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NitroAppPlugin } from "nitro/types";
import { expect, test, vi } from "vitest";

const plugins = {
  database: async () => await import("../nitro/plugins/database.ts"),
  "warm-cache": async () => await import("../nitro/plugins/warm-cache.ts"),
};

function ignore(): void {
  // A plugin that does nothing calls no hook, so there is nothing to answer.
}

function createNitroApp(hooked: Array<string>): Parameters<NitroAppPlugin>[0] {
  return {
    fetch: () => new globalThis.Response(),
    hooks: {
      callHook: ignore,
      hook: (name) => {
        hooked.push(name);

        return ignore;
      },
      removeHook: ignore,
    },
  };
}

test.for(Object.entries(plugins))(
  "on Vercel, the %s plugin leaves the data folder alone and hooks nothing",
  async ([, load], context) => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), "slopstagram-read-only-"));
    vi.stubEnv("SLOPSTAGRAM_DATA_DIR", dataDirectory);
    vi.stubEnv("SLOPSTAGRAM_DATABASE_PATH", undefined);
    vi.stubEnv("VERCEL", "1");
    vi.resetModules();
    context.onTestFinished(async () => {
      vi.unstubAllEnvs();
      await rm(dataDirectory, { force: true, recursive: true });
    });
    const hooked: Array<string> = [];

    const { default: plugin } = await load();
    await plugin(createNitroApp(hooked));

    expect(existsSync(path.join(dataDirectory, "slopstagram.sqlite"))).toBe(false);
    expect(hooked).toStrictEqual([]);
  },
);
