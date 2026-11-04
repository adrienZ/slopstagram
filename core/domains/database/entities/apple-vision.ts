import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";

export const appleVision = sqliteTable("apple_vision", {
  caption: text().notNull(),
  mediaPk: text().primaryKey(),
});

export const NewAppleVisionSchema = createInsertSchema(appleVision);
