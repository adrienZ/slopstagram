PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_story_stickers` (
	`occurrenceId` text PRIMARY KEY NOT NULL,
	`providerOccurrenceId` text,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`mediaPk` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`source` text DEFAULT 'unknown' NOT NULL,
	CONSTRAINT `fk_story_stickers_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_story_stickers`(`occurrenceId`, `kind`, `label`, `mediaPk`, `sortOrder`, `source`) SELECT lower(hex(randomblob(16))), `kind`, `label`, `mediaPk`, `sortOrder`, `source` FROM `story_stickers`;--> statement-breakpoint
DROP TABLE `story_stickers`;--> statement-breakpoint
ALTER TABLE `__new_story_stickers` RENAME TO `story_stickers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `story_stickers_media_order` ON `story_stickers` (`mediaPk`,`sortOrder`);