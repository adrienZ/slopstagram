CREATE TABLE `story_image_versions` (
	`height` integer,
	`mediaPk` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`url` text,
	`width` integer,
	CONSTRAINT `story_image_versions_pk` PRIMARY KEY(`mediaPk`, `sortOrder`),
	CONSTRAINT `fk_story_image_versions_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `story_locations` (
	`label` text NOT NULL,
	`mediaPk` text NOT NULL,
	`sortOrder` integer NOT NULL,
	CONSTRAINT `story_locations_pk` PRIMARY KEY(`mediaPk`, `sortOrder`),
	CONSTRAINT `fk_story_locations_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `story_stickers` (
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`mediaPk` text NOT NULL,
	`sortOrder` integer NOT NULL,
	CONSTRAINT `story_stickers_pk` PRIMARY KEY(`mediaPk`, `sortOrder`),
	CONSTRAINT `fk_story_stickers_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `story_video_versions` (
	`height` integer,
	`mediaPk` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`type` integer,
	`url` text,
	`width` integer,
	CONSTRAINT `story_video_versions_pk` PRIMARY KEY(`mediaPk`, `sortOrder`),
	CONSTRAINT `fk_story_video_versions_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `story_image_versions` (`height`, `mediaPk`, `sortOrder`, `url`, `width`)
SELECT
	json_extract(version.value, '$.height'),
	story.`mediaPk`,
	CAST(version.key AS INTEGER),
	json_extract(version.value, '$.url'),
	json_extract(version.value, '$.width')
FROM `stories` AS story, json_each(story.`imageVersions`, '$.candidates') AS version;
--> statement-breakpoint
INSERT INTO `story_video_versions` (`height`, `mediaPk`, `sortOrder`, `type`, `url`, `width`)
SELECT
	json_extract(version.value, '$.height'),
	story.`mediaPk`,
	CAST(version.key AS INTEGER),
	json_extract(version.value, '$.type'),
	json_extract(version.value, '$.url'),
	json_extract(version.value, '$.width')
FROM `stories` AS story, json_each(story.`videoVersions`) AS version;
--> statement-breakpoint
INSERT INTO `story_stickers` (`kind`, `label`, `mediaPk`, `sortOrder`)
SELECT
	'mention',
	CASE
		WHEN json_extract(sticker.value, '$.bloks_sticker.sticker_data.ig_mention.username') IS NOT NULL
			THEN 'mention:@' || json_extract(sticker.value, '$.bloks_sticker.sticker_data.ig_mention.username')
		ELSE 'mention:' || json_extract(sticker.value, '$.bloks_sticker.sticker_data.ig_mention.full_name')
	END,
	story.`mediaPk`,
	CAST(sticker.key AS INTEGER)
FROM `stories` AS story, json_each(story.`storyBloksStickers`) AS sticker
WHERE json_extract(sticker.value, '$.bloks_sticker.sticker_data.ig_mention.username') IS NOT NULL
	OR json_extract(sticker.value, '$.bloks_sticker.sticker_data.ig_mention.full_name') IS NOT NULL;
--> statement-breakpoint
INSERT INTO `story_stickers` (`kind`, `label`, `mediaPk`, `sortOrder`)
SELECT
	'music',
	CASE
		WHEN json_extract(sticker.value, '$.music_asset_info.display_artist') IS NOT NULL
			AND json_extract(sticker.value, '$.music_asset_info.display_artist') <> ''
			THEN 'music:' || json_extract(sticker.value, '$.music_asset_info.title') || ' - ' || json_extract(sticker.value, '$.music_asset_info.display_artist')
		ELSE 'music:' || json_extract(sticker.value, '$.music_asset_info.title')
	END,
	story.`mediaPk`,
	10000 + CAST(sticker.key AS INTEGER)
FROM `stories` AS story, json_each(story.`storyMusicStickers`) AS sticker
WHERE json_extract(sticker.value, '$.music_asset_info.title') IS NOT NULL
	AND json_extract(sticker.value, '$.music_asset_info.title') <> '';
--> statement-breakpoint
INSERT INTO `story_stickers` (`kind`, `label`, `mediaPk`, `sortOrder`)
SELECT
	'hashtag',
	'hashtag:#' || ltrim(COALESCE(json_extract(sticker.value, '$.hashtag'), json_extract(sticker.value, '$.name'), json_extract(sticker.value, '$.tag_name')), '#'),
	story.`mediaPk`,
	20000 + CAST(sticker.key AS INTEGER)
FROM `stories` AS story, json_each(story.`storyHashtags`) AS sticker
WHERE COALESCE(json_extract(sticker.value, '$.hashtag'), json_extract(sticker.value, '$.name'), json_extract(sticker.value, '$.tag_name')) IS NOT NULL;
--> statement-breakpoint
INSERT INTO `story_stickers` (`kind`, `label`, `mediaPk`, `sortOrder`)
SELECT
	'link',
	CASE
		WHEN json_extract(sticker.value, '$.story_link.link_title') IS NOT NULL
			THEN 'link:' || json_extract(sticker.value, '$.story_link.link_title') || ' (' || json_extract(sticker.value, '$.story_link.url') || ')'
		ELSE 'link:' || json_extract(sticker.value, '$.story_link.url')
	END,
	story.`mediaPk`,
	30000 + CAST(sticker.key AS INTEGER)
FROM `stories` AS story, json_each(story.`storyLinkStickers`) AS sticker
WHERE json_extract(sticker.value, '$.story_link.url') IS NOT NULL;
--> statement-breakpoint
INSERT INTO `story_locations` (`label`, `mediaPk`, `sortOrder`)
SELECT
	trim(
		COALESCE(json_extract(location.value, '$.location.name'), '') ||
		CASE
			WHEN json_extract(location.value, '$.location.name') IS NOT NULL
				AND json_extract(location.value, '$.location.address') IS NOT NULL
				AND json_extract(location.value, '$.location.address') <> '' THEN ', '
			ELSE ''
		END ||
		COALESCE(json_extract(location.value, '$.location.address'), '')
	),
	story.`mediaPk`,
	CAST(location.key AS INTEGER)
FROM `stories` AS story, json_each(story.`storyLocations`) AS location
WHERE json_extract(location.value, '$.location.name') IS NOT NULL
	OR json_extract(location.value, '$.location.address') IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `imageVersions`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `storyBloksStickers`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `storyBloksTappables`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `storyCta`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `storyHashtags`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `storyLinkStickers`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `storyLocations`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `storyMusicStickers`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `textPostShareToIgStoryStickers`;
--> statement-breakpoint
ALTER TABLE `stories` DROP COLUMN `videoVersions`;
