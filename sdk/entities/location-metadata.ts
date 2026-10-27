import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { stories, storyStickers } from "./story.ts";

export const metadataLocations = sqliteTable(
  "metadata_location",
  {
    id: text().primaryKey().notNull().$defaultFn(randomUUID),
    instagramPlaceId: text().unique(),
    name: text(),
    address: text(),
    latitude: real(),
    longitude: real(),
    facebookPlacesId: text(),
    externalSource: text(),
    category: text(),
    city: text(),
    zip: text(),
    lastLookupAttemptAt: integer(),
  },
  (table) => [
    check(
      "location_latitude_bounds",
      sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`,
    ),
    check(
      "location_longitude_bounds",
      sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`,
    ),
    ...[
      table.instagramPlaceId,
      table.name,
      table.address,
      table.facebookPlacesId,
      table.externalSource,
    ].map((column, position) =>
      check(
        `location_text_nonempty_${position}`,
        sql`${column} IS NULL OR length(trim(${column}, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0`,
      ),
    ),
  ],
);

// Instagram's descriptive information about a place; written only by place lookups.
export const metadataLocationDetails = sqliteTable(
  "metadata_location_details",
  {
    locationId: text()
      .primaryKey()
      .notNull()
      .references(() => metadataLocations.id, { onDelete: "cascade" }),
    phone: text(),
    priceRange: integer(),
    slug: text(),
    businessAccountId: text(),
    businessAccountUsername: text(),
    businessAccountPictureUrl: text(),
  },
  (table) =>
    [
      table.phone,
      table.slug,
      table.businessAccountId,
      table.businessAccountUsername,
      table.businessAccountPictureUrl,
    ].map((column, position) =>
      check(
        `location_details_text_nonempty_${position}`,
        sql`${column} IS NULL OR length(trim(${column}, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0`,
      ),
    ),
);

export const storyLocationObservations = sqliteTable(
  "story_location_observations",
  {
    id: text().primaryKey().notNull().$defaultFn(randomUUID),
    mediaPk: text()
      .notNull()
      .references(() => stories.mediaPk, { onDelete: "cascade" }),
    source: text().notNull(),
    sortOrder: integer().notNull(),
    providerOccurrenceId: text(),
    occurrenceId: text().references(() => storyStickers.occurrenceId, { onDelete: "set null" }),
    locationId: text()
      .notNull()
      .references(() => metadataLocations.id),
  },
  (table) => [index("location_observations_story_source").on(table.mediaPk, table.source)],
);

const StoredLocationSchema = createSelectSchema(metadataLocations, {
  latitude: (schema) => schema.min(-90).max(90),
  longitude: (schema) => schema.min(-180).max(180),
  // Stories cached before lookups existed have no attempt time, category, city or zip code.
  category: (schema) => schema.nullable().default(null),
  city: (schema) => schema.nullable().default(null),
  zip: (schema) => schema.nullable().default(null),
  lastLookupAttemptAt: (schema) => schema.nullable().default(null),
});
const LocationMetadataSchema = z.discriminatedUnion("status", [
  StoredLocationSchema.extend({ status: z.literal("partial") }),
  StoredLocationSchema.extend({
    status: z.literal("usable"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
]);
export const StoryLocationObservationSchema = createSelectSchema(storyLocationObservations)
  .omit({ mediaPk: true, sortOrder: true, locationId: true })
  .extend({ metadata: LocationMetadataSchema });
export const PlaceDetailsSchema = createSelectSchema(metadataLocationDetails, {
  priceRange: (schema) => schema.int(),
}).omit({ locationId: true });
export type PlaceDetails = z.infer<typeof PlaceDetailsSchema>;
// Fields stories can write. Lookup results and bookkeeping are written only by place lookups.
export type LocationFields = Omit<
  typeof metadataLocations.$inferSelect,
  "id" | "category" | "zip" | "lastLookupAttemptAt"
>;
export type LocationMetadata = z.infer<typeof LocationMetadataSchema>;
export type StoryLocationObservation = z.infer<typeof StoryLocationObservationSchema>;
export function classifyLocation(row: typeof metadataLocations.$inferSelect): LocationMetadata {
  return row.latitude !== null && row.longitude !== null
    ? { ...row, latitude: row.latitude, longitude: row.longitude, status: "usable" }
    : { ...row, status: "partial" };
}
