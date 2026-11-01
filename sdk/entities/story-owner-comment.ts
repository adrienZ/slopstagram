import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod";
import { stories } from "./story.ts";

export const storyOwnerComments = sqliteTable(
  "story_owner_comments",
  {
    commentPk: text().primaryKey(),
    createdAt: integer().notNull(),
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    text: text().notNull(),
  },
  (table) => [index("story_owner_comments_media").on(table.mediaPk, table.createdAt)],
);

export const StoryOwnerCommentSchema = createSelectSchema(storyOwnerComments, {
  commentPk: (schema) => schema.min(1),
  text: (schema) => schema.min(1),
}).omit({ mediaPk: true });

export type StoryOwnerComment = z.infer<typeof StoryOwnerCommentSchema>;
