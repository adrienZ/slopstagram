CREATE TABLE `metadata_location` (
	`id` text PRIMARY KEY NOT NULL,
	`instagramPlaceId` text UNIQUE,
	`name` text,
	`address` text,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`facebookPlacesId` text,
	`externalSource` text,
	CONSTRAINT "location_latitude_bounds" CHECK("latitude" BETWEEN -90 AND 90),
	CONSTRAINT "location_longitude_bounds" CHECK("longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE `metadata_location_partial` (
	`id` text PRIMARY KEY NOT NULL,
	`instagramPlaceId` text UNIQUE,
	`name` text,
	`address` text,
	`latitude` real,
	`longitude` real,
	`facebookPlacesId` text,
	`externalSource` text
);
--> statement-breakpoint
CREATE TABLE `story_location_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`mediaPk` text NOT NULL,
	`source` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`providerOccurrenceId` text,
	`occurrenceId` text,
	`locationId` text,
	`partialLocationId` text,
	CONSTRAINT `fk_story_location_observations_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE,
	CONSTRAINT `fk_story_location_observations_occurrenceId_story_stickers_occurrenceId_fk` FOREIGN KEY (`occurrenceId`) REFERENCES `story_stickers`(`occurrenceId`) ON DELETE SET NULL,
	CONSTRAINT `fk_story_location_observations_locationId_metadata_location_id_fk` FOREIGN KEY (`locationId`) REFERENCES `metadata_location`(`id`),
	CONSTRAINT `fk_story_location_observations_partialLocationId_metadata_location_partial_id_fk` FOREIGN KEY (`partialLocationId`) REFERENCES `metadata_location_partial`(`id`),
	CONSTRAINT "location_observation_single_metadata" CHECK(("locationId" IS NOT NULL) != ("partialLocationId" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `location_observations_story_source` ON `story_location_observations` (`mediaPk`,`source`);--> statement-breakpoint
CREATE INDEX `location_observations_partial` ON `story_location_observations` (`partialLocationId`);
