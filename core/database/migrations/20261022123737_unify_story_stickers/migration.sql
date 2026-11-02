CREATE TABLE `story_sticker_sources` (
	`mediaPk` text NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT `story_sticker_sources_pk` PRIMARY KEY(`mediaPk`, `source`),
	CONSTRAINT `fk_story_sticker_sources_mediaPk_stories_mediaPk_fk` FOREIGN KEY (`mediaPk`) REFERENCES `stories`(`mediaPk`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `story_stickers` ADD `source` text DEFAULT 'unknown' NOT NULL;
--> statement-breakpoint
CREATE TEMP TABLE `__story_sticker_backfill` AS
SELECT `mediaPk`, `kind`, `label`, `source`,
  ROW_NUMBER() OVER (
    PARTITION BY `mediaPk` ORDER BY `sourceRank`, `previousSortOrder`
  ) - 1 AS `sortOrder`
FROM (
  SELECT `mediaPk`, `kind`, `label`, `source`,
    0 AS `sourceRank`, `sortOrder` AS `previousSortOrder`
  FROM `story_stickers`
  UNION ALL
  SELECT `mediaPk`, 'location' AS `kind`, `label`, 'unknown' AS `source`,
    1 AS `sourceRank`, `sortOrder` AS `previousSortOrder`
  FROM `story_locations`
);
--> statement-breakpoint
DELETE FROM `story_stickers`;
--> statement-breakpoint
INSERT INTO `story_stickers` (`mediaPk`, `kind`, `label`, `source`, `sortOrder`)
SELECT `mediaPk`, `kind`, `label`, `source`, `sortOrder`
FROM `__story_sticker_backfill`;
--> statement-breakpoint
DROP TABLE `__story_sticker_backfill`;
