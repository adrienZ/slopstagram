import { and, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import { storyAudio, type StoryAudio } from "../entities/story-audio.ts";

type AudioDatabase = Pick<DrizzleDatabase, "select" | "insert" | "update" | "delete">;

export function findStoryAudio(database: AudioDatabase, mediaPk: string) {
  return database.select().from(storyAudio).where(eq(storyAudio.mediaPk, mediaPk)).get();
}

export function saveStoryAudio(database: AudioDatabase, mediaPk: string, entry: StoryAudio | null) {
  if (entry === null) {
    database.delete(storyAudio).where(eq(storyAudio.mediaPk, mediaPk)).run();
    return;
  }
  database
    .insert(storyAudio)
    .values(entry)
    .onConflictDoUpdate({ target: storyAudio.mediaPk, set: entry })
    .run();
}

export function saveStoryAudioMedia(
  database: AudioDatabase,
  current: StoryAudio,
  cachePath: string | null,
  state: StoryAudio["state"],
) {
  database
    .update(storyAudio)
    .set({ cachePath, state })
    .where(
      and(eq(storyAudio.mediaPk, current.mediaPk), eq(storyAudio.sourceUrl, current.sourceUrl)),
    )
    .run();
}
