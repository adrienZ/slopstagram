import type { StoriesManifestReport } from "@@/core/domains/fetch-run/report-types.ts";
import type { InstagramClient } from "@@/core/domains/instagram/instagram-types.ts";

// The shapes of the external boundaries the runtime exposes. They live here, not in the domains
// that call them, so runtime.ts imports nothing from those domains.

interface FetchImageResponse {
  arrayBuffer: () => Promise<ArrayBuffer>;
  headers: {
    get: (name: string) => string | null;
  };
  ok: boolean;
  status: number;
}

export type FetchImage = (url: string) => Promise<FetchImageResponse>;

export type FetchMedia = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

// A callback rather than a client, so the Instagram session lives only as long as the fetch.
export type WithInstagramClient = <T>(run: (client: InstagramClient) => Promise<T>) => Promise<T>;

export type DatabaseBackup = (at: Date) => void;

export type AppleOcrRunner = (image: Uint8Array) => Promise<string>;

interface ScheduledQueue {
  on: (event: "error", listener: (error: Error) => void) => void;
  cron: (id: string, pattern: string) => Promise<object | null>;
  close: () => Promise<void>;
}

export interface WarmCacheJobResult {
  outputFileName: string;
  reportKey: string;
  counts: StoriesManifestReport["metadata"]["counts"];
}

export type FetchRunQueue = (
  name: string,
  processor: () => Promise<WarmCacheJobResult>,
) => ScheduledQueue;
