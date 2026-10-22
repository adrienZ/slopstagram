import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-orm/zod";

export const instagramUsers = sqliteTable("instagram_users", {
  fullName: text(),
  id: text().notNull(),
  pk: text().notNull().primaryKey(),
  username: text().notNull(),
});

export const NewInstagramUserSchema = createInsertSchema(instagramUsers);
