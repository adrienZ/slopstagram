/// <reference types="@vitejs/devtools-kit" />
import { spawn } from "node:child_process";
import process from "node:process";
import type { Plugin } from "vite";

// Neither tool can be embedded: the bunqueue dashboard sends `frame-ancestors 'none'` and
// Drizzle Studio cannot reach its local server from inside an iframe. Each dock starts the
// tool in a DevTools terminal and opens it in its own browser tab.
const DASHBOARD_PORT = 8080;
const STUDIO_URL = "https://local.drizzle.studio";

interface Tool {
  id: string;
  title: string;
  icon: string;
  description: string;
  url: string;
  command: Array<string>;
  env?: Record<string, string>;
}

const TOOLS: Array<Tool> = [
  {
    id: "drizzle-studio",
    title: "Drizzle Studio",
    icon: "simple-icons:drizzle",
    description: "Browse the SQLite database",
    url: STUDIO_URL,
    command: ["drizzle-kit", "studio"],
  },
  {
    id: "bunqueue-dashboard",
    title: "bunqueue",
    icon: "ph:queue-duotone",
    description: "Inspect queues and jobs of the bunqueue server started by Nitro",
    url: `http://127.0.0.1:${DASHBOARD_PORT}`,
    command: ["bunqueue-dashboard"],
    // The bunqueue server is already started by the Nitro plugin; do not let the dashboard spawn another.
    env: { BUNQUEUE_MANAGED: "0", PORT: String(DASHBOARD_PORT) },
  },
];

function browserCommand(url: string): Array<string> {
  if (process.platform === "darwin") {
    return ["open", url];
  }
  if (process.platform === "win32") {
    return ["cmd", "/c", "start", "", url];
  }
  return ["xdg-open", url];
}

function openInBrowser(url: string): void {
  const [command, ...args] = browserCommand(url);
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

export function devtoolsLaunchers(): Plugin {
  return {
    name: "slopstagram:devtools-launchers",
    devtools: {
      setup(ctx) {
        for (const tool of TOOLS) {
          // The browser viewer cannot call a function on the dock entry, so the launch button is
          // bound to a registered command instead.
          const commandId = `${tool.id}:launch`;
          ctx.commands.register({
            id: commandId,
            title: `Start ${tool.title}`,
            async handler() {
              await ctx.terminals.startChildProcess(
                {
                  command: "npm",
                  args: ["exec", "--no-install", "--", ...tool.command],
                  cwd: process.cwd(),
                  env: tool.env,
                },
                { id: `${tool.id}:process`, title: tool.title },
              );
              openInBrowser(tool.url);
            },
          });
          ctx.docks.register({
            id: tool.id,
            title: tool.title,
            icon: tool.icon,
            type: "launcher",
            launcher: {
              title: `Start ${tool.title}`,
              description: `${tool.description}. Opens in a new tab.`,
              buttonStart: "Start and open",
              buttonLoading: "Starting...",
              command: commandId,
            },
          });
        }
      },
    },
  };
}
