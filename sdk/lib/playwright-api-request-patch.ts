import type { IncomingMessage } from "node:http";
import https from "node:https";
import { URL } from "node:url";

let installed = false;

export function installPlaywrightApiRequestPatch(): void {
  if (installed) return;
  installed = true;

  const request = https.request;

  // Bun can expose IncomingMessage.url as a relative path. Playwright expects an absolute
  // response URL while parsing Set-Cookie, so normalize just that value for HTTPS requests.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Preserve Node's overloaded https.request type while wrapping Playwright's URL overload.
  https.request = ((
    url: URL,
    options: https.RequestOptions,
    callback?: (res: IncomingMessage) => void,
  ) =>
    request(url, options, (response) => {
      const responseWithUrl = response as IncomingMessage & { url?: string };
      if (typeof responseWithUrl.url === "string" && responseWithUrl.url.startsWith("/")) {
        responseWithUrl.url = new URL(responseWithUrl.url, url).toString();
      }

      callback?.(response);
    })) as typeof https.request;
}
