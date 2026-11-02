CREATE TABLE `metadata_music` (
	`id` text PRIMARY KEY NOT NULL,
	`instagramAudioAssetId` text NOT NULL UNIQUE,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`durationMs` integer,
	`spotifyTrackId` text,
	`matchingState` text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "music_audio_identity_nonempty" CHECK(length(trim("instagramAudioAssetId")) > 0),
	CONSTRAINT "music_title_nonempty" CHECK(length(trim("title")) > 0),
	CONSTRAINT "music_artist_nonempty" CHECK(length(trim("artist")) > 0),
	CONSTRAINT "music_duration_positive" CHECK("durationMs" IS NULL OR "durationMs" > 0)
);
--> statement-breakpoint
CREATE TABLE `metadata_music_partial` (
	`id` text PRIMARY KEY NOT NULL,
	`instagramAudioAssetId` text UNIQUE,
	`title` text,
	`artist` text,
	`durationMs` integer,
	`spotifyTrackId` text,
	`matchingState` text
);
--> statement-breakpoint
CREATE TABLE `story_music_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`mediaPk` text NOT NULL,
	`source` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`providerOccurrenceId` text,
	`occurrenceId` text,
	`musicId` text,
	`partialMusicId` text,
	CONSTRAINT `fk_story_music_observations_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE,
	CONSTRAINT `fk_story_music_observations_occurrenceId_story_stickers_occurrenceId_fk` FOREIGN KEY (`occurrenceId`) REFERENCES `story_stickers`(`occurrenceId`) ON DELETE SET NULL,
	CONSTRAINT `fk_story_music_observations_musicId_metadata_music_id_fk` FOREIGN KEY (`musicId`) REFERENCES `metadata_music`(`id`),
	CONSTRAINT `fk_story_music_observations_partialMusicId_metadata_music_partial_id_fk` FOREIGN KEY (`partialMusicId`) REFERENCES `metadata_music_partial`(`id`),
	CONSTRAINT "music_observation_single_metadata" CHECK(("musicId" IS NOT NULL) != ("partialMusicId" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `music_observations_story_source` ON `story_music_observations` (`mediaPk`,`source`);--> statement-breakpoint
CREATE INDEX `music_observations_partial` ON `story_music_observations` (`partialMusicId`);
