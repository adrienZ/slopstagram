CREATE TABLE `story_owner_comments` (
	`commentPk` text PRIMARY KEY,
	`createdAt` integer NOT NULL,
	`mediaPk` text NOT NULL,
	`text` text NOT NULL,
	CONSTRAINT `fk_story_owner_comments_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `story_owner_comments_media` ON `story_owner_comments` (`mediaPk`,`createdAt`);