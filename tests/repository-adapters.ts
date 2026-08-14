import type { AppleVisionRepository } from "../sdk/entities/apple-vision.ts";
import type { UserSummaryRepository } from "../sdk/entities/user-summary.ts";
import type { VisionRepository } from "../sdk/entities/vision.ts";
import type { UserSummaryEntry, VisionEntry } from "../sdk/lib/types.ts";

type InMemoryRepository<TKey, TValue, TRepository> = Pick<
  TRepository,
  "findByMediaPk" extends keyof TRepository ? "findByMediaPk" : never
> & {
  entries: Map<TKey, TValue>;
};

export function createAppleVisionRepositoryAdapter(): InMemoryRepository<
  string,
  string,
  AppleVisionRepository
> &
  Pick<AppleVisionRepository, "save"> {
  const entries = new Map<string, string>();

  return {
    entries,
    findByMediaPk: (mediaPk) => Promise.resolve(entries.get(mediaPk) ?? null),
    save: (mediaPk, caption) => {
      entries.set(mediaPk, caption);
      return Promise.resolve();
    },
  };
}

export function createVisionRepositoryAdapter(): InMemoryRepository<
  string,
  VisionEntry,
  VisionRepository
> &
  Pick<VisionRepository, "save"> {
  const entries = new Map<string, VisionEntry>();

  return {
    entries,
    findByMediaPk: (mediaPk) => Promise.resolve(entries.get(mediaPk) ?? null),
    save: (mediaPk, value) => {
      entries.set(mediaPk, value);
      return Promise.resolve();
    },
  };
}

export function createUserSummaryRepositoryAdapter(): Pick<
  UserSummaryRepository,
  "findBySourceHash" | "save"
> & {
  entries: Map<string, UserSummaryEntry>;
} {
  const entries = new Map<string, UserSummaryEntry>();

  return {
    entries,
    findBySourceHash: (sourceHash) => Promise.resolve(entries.get(sourceHash) ?? null),
    save: (value) => {
      entries.set(value.source_hash, value);
      return Promise.resolve();
    },
  };
}
