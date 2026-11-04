import type { StoriesManifestReport } from "@@/core/domains/fetch-run/report-types.ts";

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

export type FetchMedia = (url: string) => Promise<Response>;

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
