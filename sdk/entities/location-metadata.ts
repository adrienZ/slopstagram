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
    latitude: real().notNull(),
    longitude: real().notNull(),
    facebookPlacesId: text(),
    externalSource: text(),
  },
  (table) => [
    check("location_latitude_bounds", sql`${table.latitude} BETWEEN -90 AND 90`),
    check("location_longitude_bounds", sql`${table.longitude} BETWEEN -180 AND 180`),
  ],
);

export const partialMetadataLocations = sqliteTable("metadata_location_partial", {
  id: text().primaryKey().notNull().$defaultFn(randomUUID),
  instagramPlaceId: text().unique(),
  name: text(),
  address: text(),
  latitude: real(),
  longitude: real(),
  facebookPlacesId: text(),
  externalSource: text(),
});

// Observations also exist without a displayable sticker (for example an ID-only
// place). Their provenance survives independently until a certain link is possible.
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
    locationId: text().references(() => metadataLocations.id),
    partialLocationId: text().references(() => partialMetadataLocations.id),
  },
  (table) => [
    index("location_observations_story_source").on(table.mediaPk, table.source),
    index("location_observations_partial").on(table.partialLocationId),
    check(
      "location_observation_single_metadata",
      sql`(${table.locationId} IS NOT NULL) != (${table.partialLocationId} IS NOT NULL)`,
    ),
  ],
);

const LocationMetadataSchema = z.discriminatedUnion("status", [
  createSelectSchema(partialMetadataLocations, {
    latitude: (schema) => schema.min(-90).max(90),
    longitude: (schema) => schema.min(-180).max(180),
  }).extend({ status: z.literal("partial") }),
  createSelectSchema(metadataLocations, {
    latitude: (schema) => schema.min(-90).max(90),
    longitude: (schema) => schema.min(-180).max(180),
  }).extend({ status: z.literal("usable") }),
]);

export const StoryLocationObservationSchema = createSelectSchema(storyLocationObservations)
  .omit({ mediaPk: true, sortOrder: true, locationId: true, partialLocationId: true })
  .extend({ metadata: LocationMetadataSchema });

export type LocationFields = Omit<typeof partialMetadataLocations.$inferSelect, "id">;
export type LocationMetadata =
  | ({ status: "usable" } & typeof metadataLocations.$inferSelect)
  | ({ status: "partial" } & typeof partialMetadataLocations.$inferSelect);

export interface StoryLocationObservation {
  id: string;
  source: string;
  providerOccurrenceId: string | null;
  occurrenceId: string | null;
  metadata: LocationMetadata;
}
