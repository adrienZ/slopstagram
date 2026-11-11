/// <reference types="@vitejs/devtools-kit" />
import { once } from "node:events";
import { createServer } from "node:net";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import type { Plugin } from "vite";
import { z } from "zod";

// Each tool runs in a DevTools terminal started with the dev server and is shown in an iframe dock.
const DASHBOARD_PORT = 8080;
const DASHBOARD_PROXY_PATH = "/__bunqueue";

interface Tool {
  id: string;
  title: string;
  icon: string;
  command: Array<string>;
  env?: Record<string, string>;
  /** Address shown in the iframe dock. */
  frameUrl: string;
  /** Lets the frame reach localhost; needed by hosted pages that talk to a local server. */
  localNetwork?: boolean;
}

const ALLOW_LOCAL_NETWORK_SCRIPT = `/@fs${fileURLToPath(new URL("allow-local-network.ts", import.meta.url))}`;

const TOOLS: Array<Tool> = [
  {
    id: "bunqueue-dashboard",
    title: "bunqueue",
    icon: "ph:queue-duotone",
    command: ["bunqueue-dashboard"],
    env: {
      // The bunqueue server is already started by the Nitro plugin; do not let the dashboard spawn another.
      BUNQUEUE_MANAGED: "0",
      PORT: String(DASHBOARD_PORT),
      BASE_PATH: DASHBOARD_PROXY_PATH,
    },
    frameUrl: `${DASHBOARD_PROXY_PATH}/`,
  },
];

// Studio defaults to port 4983, which a Studio started by another checkout may already hold; the
// hosted page would then connect to that one. Ask the OS for a free port and tell the page about it.
async function findFreePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = z.object({ port: z.number() }).parse(server.address());
  server.close();
  await once(server, "close");
  return port;
}

async function drizzleStudio(): Promise<Tool> {
  const port = await findFreePort();
  return {
    id: "drizzle-studio",
    title: "Drizzle Studio",
    icon: "simple-icons:drizzle",
    command: ["drizzle-kit", "studio", `--port=${port}`],
    frameUrl: `https://local.drizzle.studio?port=${port}`,
    localNetwork: true,
  };
}

export function devtoolsLaunchers(): Plugin {
  return {
    name: "slopstagram:devtools-launchers",
    config() {
      return {
        server: {
          proxy: {
            // The dashboard refuses to be framed, so serve it from the dev server's own origin and
            // allow that origin only.
            [DASHBOARD_PROXY_PATH]: {
              target: `http://127.0.0.1:${DASHBOARD_PORT}`,
              ws: true,
              configure(proxy) {
                proxy.on("proxyRes", (response) => {
                  response.headers["x-frame-options"] = "SAMEORIGIN";
                  const policy = response.headers["content-security-policy"]?.toString();
                  if (policy !== undefined) {
                    response.headers["content-security-policy"] = policy.replace(
                      "frame-ancestors 'none'",
                      "frame-ancestors 'self'",
                    );
                  }
                });
              },
            },
          },
        },
      };
    },
    devtools: {
      async setup(ctx) {
        if (ctx.mode !== "dev") {
          return;
        }

        await Promise.all(
          [await drizzleStudio(), ...TOOLS].map(async (tool) => {
            const terminalId = `${tool.id}:process`;
            if (!ctx.terminals.sessions.has(terminalId)) {
              await ctx.terminals.startChildProcess(
                {
                  command: "npm",
                  args: ["exec", "--no-install", "--", ...tool.command],
                  cwd: process.cwd(),
                  env: tool.env,
                },
                { id: terminalId, title: tool.title },
              );
            }
            ctx.docks.register({
              id: tool.id,
              title: tool.title,
              icon: tool.icon,
              type: "iframe",
              url: tool.frameUrl,
              clientScript:
                tool.localNetwork === true
                  ? { eager: true, importFrom: ALLOW_LOCAL_NETWORK_SCRIPT }
                  : undefined,
            });
          }),
        );
      },
    },
  };
}
