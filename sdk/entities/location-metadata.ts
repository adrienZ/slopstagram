import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { stories, storyStickers } from "./story.ts";

function locationFields() {
  return {
    id: text().primaryKey().notNull().$defaultFn(randomUUID),
    instagramPlaceId: text().unique(),
    name: text(),
    address: text(),
    latitude: real(),
    longitude: real(),
    facebookPlacesId: text(),
    externalSource: text(),
  };
}

export const metadataLocations = sqliteTable(
  "metadata_location",
  {
    ...locationFields(),
    latitude: real().notNull(),
    longitude: real().notNull(),
  },
  (table) => [
    check("location_latitude_bounds", sql`${table.latitude} BETWEEN -90 AND 90`),
    check("location_longitude_bounds", sql`${table.longitude} BETWEEN -180 AND 180`),
  ],
);

export const partialMetadataLocations = sqliteTable("metadata_location_partial", locationFields());

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
