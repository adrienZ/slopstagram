import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import { z } from "zod";
import type { TestContext } from "vitest";
import { Buffer } from "node:buffer";

export function wavAudio(seconds = 1) {
  const bytes = seconds * 16_000;
  const wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(bytes, 40);
  return wav;
}

export async function startMediaServer(context: TestContext, handler: RequestListener) {
  const requests: Array<string> = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? "/");
    handler(request, response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = z.object({ port: z.number() }).parse(server.address());
  const origin = `http://127.0.0.1:${address.port}`;
  context.onTestFinished(async () => {
    server.closeAllConnections();
    const closed = once(server, "close");
    server.close();
    await closed;
  });
  return {
    requests,
    // Keep production's HTTPS source validation; route only the network boundary
    // to a loopback HTTP server. Status, headers, bytes and failures are real HTTP.
    fetchMedia: async (source: string) => {
      const url = new globalThis.URL(source);
      return await globalThis.fetch(`${origin}${url.pathname}${url.search}`);
    },
  };
}
