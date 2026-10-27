ALTER TABLE `metadata_music` ADD `audioSourceUrl` text;--> statement-breakpoint
ALTER TABLE `metadata_music` ADD `artworkSourceUrl` text;--> statement-breakpoint
ALTER TABLE `metadata_music` ADD `audioCachePath` text;--> statement-breakpoint
ALTER TABLE `metadata_music` ADD `artworkCachePath` text;--> statement-breakpoint
ALTER TABLE `metadata_music` ADD `audioState` text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE `metadata_music` ADD `artworkState` text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE `metadata_music_partial` ADD `audioSourceUrl` text;--> statement-breakpoint
ALTER TABLE `metadata_music_partial` ADD `artworkSourceUrl` text;--> statement-breakpoint
ALTER TABLE `metadata_music_partial` ADD `audioCachePath` text;--> statement-breakpoint
ALTER TABLE `metadata_music_partial` ADD `artworkCachePath` text;--> statement-breakpoint
ALTER TABLE `metadata_music_partial` ADD `audioState` text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE `metadata_music_partial` ADD `artworkState` text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE `metadata_music` DROP COLUMN `spotifyTrackId`;--> statement-breakpoint
ALTER TABLE `metadata_music` DROP COLUMN `matchingState`;--> statement-breakpoint
ALTER TABLE `metadata_music_partial` DROP COLUMN `spotifyTrackId`;--> statement-breakpoint
ALTER TABLE `metadata_music_partial` DROP COLUMN `matchingState`;