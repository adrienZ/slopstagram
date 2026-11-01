import { asc, eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../database/client.ts";
import { storyOwnerComments, type StoryOwnerComment } from "../entities/story-owner-comment.ts";

type OwnerCommentDatabase = Pick<DrizzleDatabase, "select" | "insert">;

export function readOwnerComments(
  database: OwnerCommentDatabase,
  mediaPk: string,
): Array<StoryOwnerComment> {
  return database
    .select({
      commentPk: storyOwnerComments.commentPk,
      createdAt: storyOwnerComments.createdAt,
      text: storyOwnerComments.text,
    })
    .from(storyOwnerComments)
    .where(eq(storyOwnerComments.mediaPk, mediaPk))
    .orderBy(asc(storyOwnerComments.createdAt), asc(storyOwnerComments.commentPk))
    .all();
}

export function recordOwnerComments(
  database: OwnerCommentDatabase,
  mediaPk: string,
  comments: ReadonlyArray<StoryOwnerComment>,
) {
  for (const comment of comments) {
    const entry = { ...comment, mediaPk };
    database
      .insert(storyOwnerComments)
      .values(entry)
      .onConflictDoUpdate({ target: storyOwnerComments.commentPk, set: entry })
      .run();
  }
}
