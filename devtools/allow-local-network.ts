import type { DockClientScriptContext } from "@vitejs/devtools-kit/client";

// Chromium only lets a cross-origin frame reach localhost when the embedder grants it. Studio's hosted
// page talks to the local Drizzle Kit server, so without this it stays on "Connecting".
const PERMISSIONS = "local-network-access; local-network; loopback-network";

function grant(iframe: HTMLIFrameElement): void {
  if (iframe.allow === PERMISSIONS) {
    return;
  }
  iframe.allow = PERMISSIONS;
  // `allow` only applies to a document loaded after it is set.
  iframe.contentWindow?.location.replace(iframe.src);
}

export default function setup(ctx: DockClientScriptContext): void {
  const { iframe } = ctx.current.domElements;
  if (iframe) {
    grant(iframe);
  }
  ctx.current.events.on("dom:iframe:mounted", grant);
}
