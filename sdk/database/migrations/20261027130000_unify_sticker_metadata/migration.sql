-- Preserve observations while consolidating partial and usable metadata.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_metadata_location` (
	`id` text PRIMARY KEY,
	`instagramPlaceId` text UNIQUE,
	`name` text,
	`address` text,
	`latitude` real,
	`longitude` real,
	`facebookPlacesId` text,
	`externalSource` text,
	CONSTRAINT "location_latitude_bounds" CHECK("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
	CONSTRAINT "location_longitude_bounds" CHECK("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
	CONSTRAINT "location_text_nonempty_0" CHECK("instagramPlaceId" IS NULL OR length(trim("instagramPlaceId", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "location_text_nonempty_1" CHECK("name" IS NULL OR length(trim("name", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "location_text_nonempty_2" CHECK("address" IS NULL OR length(trim("address", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "location_text_nonempty_3" CHECK("facebookPlacesId" IS NULL OR length(trim("facebookPlacesId", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "location_text_nonempty_4" CHECK("externalSource" IS NULL OR length(trim("externalSource", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0)
);
--> statement-breakpoint
INSERT INTO `__new_metadata_location` (`id`, `instagramPlaceId`, `name`, `address`, `latitude`, `longitude`, `facebookPlacesId`, `externalSource`) SELECT `id`, CASE WHEN length(trim(`instagramPlaceId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `instagramPlaceId` END, CASE WHEN length(trim(`name`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `name` END, CASE WHEN length(trim(`address`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `address` END, CASE WHEN `latitude` BETWEEN -90 AND 90 THEN `latitude` ELSE NULL END, CASE WHEN `longitude` BETWEEN -180 AND 180 THEN `longitude` ELSE NULL END, CASE WHEN length(trim(`facebookPlacesId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `facebookPlacesId` END, CASE WHEN length(trim(`externalSource`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `externalSource` END FROM `metadata_location`;
--> statement-breakpoint
CREATE TEMP TABLE `migration_location_ids` (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);
--> statement-breakpoint
INSERT INTO `migration_location_ids` SELECT p.id, COALESCE(n.id, p.id) FROM `metadata_location_partial` p LEFT JOIN `__new_metadata_location` n ON n.`instagramPlaceId` = CASE WHEN length(trim(p.`instagramPlaceId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE p.`instagramPlaceId` END;
--> statement-breakpoint
UPDATE `__new_metadata_location` SET `name` = COALESCE(`name`, (SELECT CASE WHEN length(trim(p.`name`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE p.`name` END FROM `metadata_location_partial` p JOIN `migration_location_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_location`.id)) WHERE EXISTS (SELECT 1 FROM `migration_location_ids` m WHERE m.new_id=`__new_metadata_location`.id);
--> statement-breakpoint
UPDATE `__new_metadata_location` SET `address` = COALESCE(`address`, (SELECT CASE WHEN length(trim(p.`address`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE p.`address` END FROM `metadata_location_partial` p JOIN `migration_location_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_location`.id)) WHERE EXISTS (SELECT 1 FROM `migration_location_ids` m WHERE m.new_id=`__new_metadata_location`.id);
--> statement-breakpoint
UPDATE `__new_metadata_location` SET `latitude` = COALESCE(`latitude`, (SELECT CASE WHEN p.`latitude` BETWEEN -90 AND 90 THEN p.`latitude` ELSE NULL END FROM `metadata_location_partial` p JOIN `migration_location_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_location`.id)) WHERE EXISTS (SELECT 1 FROM `migration_location_ids` m WHERE m.new_id=`__new_metadata_location`.id);
--> statement-breakpoint
UPDATE `__new_metadata_location` SET `longitude` = COALESCE(`longitude`, (SELECT CASE WHEN p.`longitude` BETWEEN -180 AND 180 THEN p.`longitude` ELSE NULL END FROM `metadata_location_partial` p JOIN `migration_location_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_location`.id)) WHERE EXISTS (SELECT 1 FROM `migration_location_ids` m WHERE m.new_id=`__new_metadata_location`.id);
--> statement-breakpoint
UPDATE `__new_metadata_location` SET `facebookPlacesId` = COALESCE(`facebookPlacesId`, (SELECT CASE WHEN length(trim(p.`facebookPlacesId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE p.`facebookPlacesId` END FROM `metadata_location_partial` p JOIN `migration_location_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_location`.id)) WHERE EXISTS (SELECT 1 FROM `migration_location_ids` m WHERE m.new_id=`__new_metadata_location`.id);
--> statement-breakpoint
UPDATE `__new_metadata_location` SET `externalSource` = COALESCE(`externalSource`, (SELECT CASE WHEN length(trim(p.`externalSource`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE p.`externalSource` END FROM `metadata_location_partial` p JOIN `migration_location_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_location`.id)) WHERE EXISTS (SELECT 1 FROM `migration_location_ids` m WHERE m.new_id=`__new_metadata_location`.id);
--> statement-breakpoint
INSERT INTO `__new_metadata_location` (`id`, `instagramPlaceId`, `name`, `address`, `latitude`, `longitude`, `facebookPlacesId`, `externalSource`) SELECT `id`, CASE WHEN length(trim(`instagramPlaceId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `instagramPlaceId` END, CASE WHEN length(trim(`name`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `name` END, CASE WHEN length(trim(`address`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `address` END, CASE WHEN `latitude` BETWEEN -90 AND 90 THEN `latitude` ELSE NULL END, CASE WHEN `longitude` BETWEEN -180 AND 180 THEN `longitude` ELSE NULL END, CASE WHEN length(trim(`facebookPlacesId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `facebookPlacesId` END, CASE WHEN length(trim(`externalSource`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `externalSource` END FROM `metadata_location_partial` p WHERE NOT EXISTS (SELECT 1 FROM `migration_location_ids` m WHERE m.old_id=p.id AND m.new_id != p.id);
--> statement-breakpoint
DROP TABLE `metadata_location`;
--> statement-breakpoint
ALTER TABLE `__new_metadata_location` RENAME TO `metadata_location`;
--> statement-breakpoint
CREATE TABLE `__new_metadata_music` (
	`id` text PRIMARY KEY,
	`instagramAudioAssetId` text UNIQUE,
	`title` text,
	`artist` text,
	`durationMs` integer,
	`audioSourceUrl` text,
	`audioDurationMs` integer,
	`artworkSourceUrl` text,
	`audioCachePath` text,
	`artworkCachePath` text,
	`audioState` text DEFAULT 'unavailable' NOT NULL,
	`artworkState` text DEFAULT 'unavailable' NOT NULL,
	CONSTRAINT "music_text_nonempty_0" CHECK("instagramAudioAssetId" IS NULL OR length(trim("instagramAudioAssetId", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "music_text_nonempty_1" CHECK("title" IS NULL OR length(trim("title", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "music_text_nonempty_2" CHECK("artist" IS NULL OR length(trim("artist", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "music_duration_positive" CHECK("durationMs" IS NULL OR "durationMs" > 0),
	CONSTRAINT "music_audio_duration_positive" CHECK("audioDurationMs" IS NULL OR "audioDurationMs" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_metadata_music` (`id`, `instagramAudioAssetId`, `title`, `artist`, `durationMs`, `audioSourceUrl`, `audioDurationMs`, `artworkSourceUrl`, `audioCachePath`, `artworkCachePath`, `audioState`, `artworkState`) SELECT `id`, CASE WHEN length(trim(`instagramAudioAssetId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `instagramAudioAssetId` END, CASE WHEN length(trim(`title`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `title` END, CASE WHEN length(trim(`artist`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `artist` END, CASE WHEN `durationMs` > 0 THEN `durationMs` ELSE NULL END, `audioSourceUrl`, CASE WHEN `audioDurationMs` > 0 THEN `audioDurationMs` ELSE NULL END, `artworkSourceUrl`, `audioCachePath`, `artworkCachePath`, `audioState`, `artworkState` FROM `metadata_music`;
--> statement-breakpoint
CREATE TEMP TABLE `migration_music_ids` (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);
--> statement-breakpoint
INSERT INTO `migration_music_ids` SELECT p.id, COALESCE(n.id, p.id) FROM `metadata_music_partial` p LEFT JOIN `__new_metadata_music` n ON n.`instagramAudioAssetId` = CASE WHEN length(trim(p.`instagramAudioAssetId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE p.`instagramAudioAssetId` END;
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `title` = COALESCE(`title`, (SELECT CASE WHEN length(trim(p.`title`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE p.`title` END FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id)) WHERE EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.new_id=`__new_metadata_music`.id);
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `artist` = COALESCE(`artist`, (SELECT CASE WHEN length(trim(p.`artist`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE p.`artist` END FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id)) WHERE EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.new_id=`__new_metadata_music`.id);
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `durationMs` = COALESCE(`durationMs`, (SELECT CASE WHEN p.`durationMs` > 0 THEN p.`durationMs` ELSE NULL END FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id)) WHERE EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.new_id=`__new_metadata_music`.id);
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `audioState` = COALESCE((SELECT p.`audioState` FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id), `audioState`) WHERE `audioSourceUrl` IS NULL AND `audioCachePath` IS NULL;
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `audioSourceUrl` = COALESCE(`audioSourceUrl`, (SELECT p.`audioSourceUrl` FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id)) WHERE EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.new_id=`__new_metadata_music`.id);
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `audioDurationMs` = COALESCE(`audioDurationMs`, (SELECT CASE WHEN p.`audioDurationMs` > 0 THEN p.`audioDurationMs` ELSE NULL END FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id)) WHERE EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.new_id=`__new_metadata_music`.id);
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `artworkState` = COALESCE((SELECT p.`artworkState` FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id), `artworkState`) WHERE `artworkSourceUrl` IS NULL AND `artworkCachePath` IS NULL;
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `artworkSourceUrl` = COALESCE(`artworkSourceUrl`, (SELECT p.`artworkSourceUrl` FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id)) WHERE EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.new_id=`__new_metadata_music`.id);
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `audioCachePath` = COALESCE(`audioCachePath`, (SELECT p.`audioCachePath` FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id)) WHERE EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.new_id=`__new_metadata_music`.id);
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `artworkCachePath` = COALESCE(`artworkCachePath`, (SELECT p.`artworkCachePath` FROM `metadata_music_partial` p JOIN `migration_music_ids` m ON m.old_id=p.id WHERE m.new_id=`__new_metadata_music`.id)) WHERE EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.new_id=`__new_metadata_music`.id);
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `audioState` = 'available' WHERE `audioCachePath` IS NOT NULL;
--> statement-breakpoint
UPDATE `__new_metadata_music` SET `artworkState` = 'available' WHERE `artworkCachePath` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `__new_metadata_music` (`id`, `instagramAudioAssetId`, `title`, `artist`, `durationMs`, `audioSourceUrl`, `audioDurationMs`, `artworkSourceUrl`, `audioCachePath`, `artworkCachePath`, `audioState`, `artworkState`) SELECT `id`, CASE WHEN length(trim(`instagramAudioAssetId`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `instagramAudioAssetId` END, CASE WHEN length(trim(`title`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `title` END, CASE WHEN length(trim(`artist`, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) = 0 THEN NULL ELSE `artist` END, CASE WHEN `durationMs` > 0 THEN `durationMs` ELSE NULL END, `audioSourceUrl`, CASE WHEN `audioDurationMs` > 0 THEN `audioDurationMs` ELSE NULL END, `artworkSourceUrl`, `audioCachePath`, `artworkCachePath`, `audioState`, `artworkState` FROM `metadata_music_partial` p WHERE NOT EXISTS (SELECT 1 FROM `migration_music_ids` m WHERE m.old_id=p.id AND m.new_id != p.id);
--> statement-breakpoint
DROP TABLE `metadata_music`;
--> statement-breakpoint
ALTER TABLE `__new_metadata_music` RENAME TO `metadata_music`;
--> statement-breakpoint
CREATE TABLE `__new_story_location_observations` (
	`id` text PRIMARY KEY,
	`mediaPk` text NOT NULL,
	`source` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`providerOccurrenceId` text,
	`occurrenceId` text,
	`locationId` text NOT NULL,
	CONSTRAINT `fk_story_location_observations_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE,
	CONSTRAINT `fk_story_location_observations_occurrenceId_story_stickers_occurrenceId_fk` FOREIGN KEY (`occurrenceId`) REFERENCES `story_stickers`(`occurrenceId`) ON DELETE SET NULL,
	CONSTRAINT `fk_story_location_observations_locationId_metadata_location_id_fk` FOREIGN KEY (`locationId`) REFERENCES `metadata_location`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_story_location_observations` (`id`,`mediaPk`,`source`,`sortOrder`,`providerOccurrenceId`,`occurrenceId`,`locationId`) SELECT o.id,o.mediaPk,o.source,o.sortOrder,o.providerOccurrenceId,o.occurrenceId,COALESCE(o.`locationId`, m.new_id) FROM `story_location_observations` o LEFT JOIN `migration_location_ids` m ON m.old_id=o.`partialLocationId`;
--> statement-breakpoint
DROP TABLE `story_location_observations`;
--> statement-breakpoint
ALTER TABLE `__new_story_location_observations` RENAME TO `story_location_observations`;
--> statement-breakpoint
CREATE INDEX `location_observations_story_source` ON `story_location_observations` (`mediaPk`,`source`);
--> statement-breakpoint
DROP TABLE `metadata_location_partial`;
--> statement-breakpoint
DROP TABLE `migration_location_ids`;
--> statement-breakpoint
CREATE TABLE `__new_story_music_observations` (
	`id` text PRIMARY KEY,
	`mediaPk` text NOT NULL,
	`source` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`providerOccurrenceId` text,
	`occurrenceId` text,
	`musicId` text NOT NULL,
	CONSTRAINT `fk_story_music_observations_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE,
	CONSTRAINT `fk_story_music_observations_occurrenceId_story_stickers_occurrenceId_fk` FOREIGN KEY (`occurrenceId`) REFERENCES `story_stickers`(`occurrenceId`) ON DELETE SET NULL,
	CONSTRAINT `fk_story_music_observations_musicId_metadata_music_id_fk` FOREIGN KEY (`musicId`) REFERENCES `metadata_music`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_story_music_observations` (`id`,`mediaPk`,`source`,`sortOrder`,`providerOccurrenceId`,`occurrenceId`,`musicId`) SELECT o.id,o.mediaPk,o.source,o.sortOrder,o.providerOccurrenceId,o.occurrenceId,COALESCE(o.`musicId`, m.new_id) FROM `story_music_observations` o LEFT JOIN `migration_music_ids` m ON m.old_id=o.`partialMusicId`;
--> statement-breakpoint
DROP TABLE `story_music_observations`;
--> statement-breakpoint
ALTER TABLE `__new_story_music_observations` RENAME TO `story_music_observations`;
--> statement-breakpoint
CREATE INDEX `music_observations_story_source` ON `story_music_observations` (`mediaPk`,`source`);
--> statement-breakpoint
DROP TABLE `metadata_music_partial`;
--> statement-breakpoint
DROP TABLE `migration_music_ids`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
