// The shapes of the external fetches the runtime exposes. They live here, not in the media-store
// and music domains that call them, so runtime.ts imports nothing from those domains.

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
