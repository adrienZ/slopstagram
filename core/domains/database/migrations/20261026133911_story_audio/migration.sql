CREATE TABLE `story_audio` (
	`mediaPk` text PRIMARY KEY,
	`sourceUrl` text NOT NULL,
	`mimeType` text NOT NULL,
	`codecs` text NOT NULL,
	`cachePath` text,
	`state` text DEFAULT 'pending' NOT NULL,
	CONSTRAINT `fk_story_audio_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE
);
