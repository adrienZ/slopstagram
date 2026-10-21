// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";
import type { AppData } from "./store.ts";
import { $page } from "./store.ts";

async function main() {
  try {
    const root = globalThis.document.querySelector("#app");
    if (root === null) {
      return;
    }
    const url = new globalThis.URL(globalThis.location.href);
    const pathname = url.pathname.replace(/\/+$/u, "");
    const endpoint = pathname.startsWith("/users/")
      ? `/api${pathname}`
      : `/api/report${url.search}`;
    const response = await globalThis.fetch(endpoint, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error("Page data could not be loaded");
    }
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- These API routes return the shared AppData type.
    const data: AppData = await response.json();
    $page.set(data);
    mount(() => <StartClient />, root);
  } catch {
    const message = globalThis.document.createElement("p");
    message.role = "alert";
    message.textContent = "Impossible de charger les interactions. Veuillez actualiser la page.";
    globalThis.document.querySelector("#app")?.prepend(message);
  }
}

void main();
