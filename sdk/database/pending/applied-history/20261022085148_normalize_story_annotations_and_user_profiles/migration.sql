ALTER TABLE `instagram_users` ADD `biography` text;
--> statement-breakpoint
-- Resolve only unambiguous usernames. Preserve unmatched owners without inventing Instagram IDs.
CREATE TABLE `__new_user_summaries` (
  `instagramUserPk` text REFERENCES `instagram_users`(`pk`),
  `legacyUsername` text,
  `promptHash` text NOT NULL,
  `result` text NOT NULL,
  `sourceHash` text PRIMARY KEY
);
--> statement-breakpoint
INSERT INTO `__new_user_summaries` (`instagramUserPk`, `legacyUsername`, `promptHash`, `result`, `sourceHash`)
SELECT
  CASE WHEN (SELECT count(*) FROM `instagram_users` u WHERE u.`username` = trim(s.`userKey`)) = 1
    THEN (SELECT u.`pk` FROM `instagram_users` u WHERE u.`username` = trim(s.`userKey`)) END,
  CASE WHEN (SELECT count(*) FROM `instagram_users` u WHERE u.`username` = trim(s.`userKey`)) <> 1
    THEN s.`userKey` END,
  s.`promptHash`, s.`result`, s.`sourceHash`
FROM `user_summaries` s;
--> statement-breakpoint
DROP TABLE `user_summaries`;
--> statement-breakpoint
ALTER TABLE `__new_user_summaries` RENAME TO `user_summaries`;
--> statement-breakpoint
CREATE INDEX `user_summaries_instagram_user_idx` ON `user_summaries` (`instagramUserPk`);
--> statement-breakpoint
-- Snapshots remain report-specific, including stories whose media fetch failed.
CREATE TABLE `report_story_stickers` (
  `kind` text NOT NULL,
  `label` text NOT NULL,
  `mediaPk` text NOT NULL,
  `reelId` text NOT NULL,
  `reportKey` text NOT NULL,
  `sortOrder` integer NOT NULL,
  PRIMARY KEY (`reportKey`, `reelId`, `mediaPk`, `sortOrder`),
  FOREIGN KEY (`reportKey`, `reelId`, `mediaPk`)
    REFERENCES `report_stories` (`reportKey`, `reelId`, `mediaPk`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `report_story_stickers` (`kind`, `label`, `mediaPk`, `reelId`, `reportKey`, `sortOrder`)
WITH annotations AS (
  SELECT s.`reportKey`, s.`reelId`, s.`mediaPk`, a.value AS label, CAST(a.key AS INTEGER) AS position
  FROM `report_stories` s, json_each(s.`stickers`) a
  UNION ALL
  SELECT s.`reportKey`, s.`reelId`, s.`mediaPk`, 'location:' || a.value,
    json_array_length(s.`stickers`) + CAST(a.key AS INTEGER)
  FROM `report_stories` s, json_each(s.`locations`) a
), labels AS (
  SELECT reportKey, reelId, mediaPk, label, min(position) AS position
  FROM annotations GROUP BY reportKey, reelId, mediaPk, label
)
SELECT CASE WHEN instr(label, ':') > 0 THEN substr(label, 1, instr(label, ':') - 1) ELSE 'other' END,
  label, mediaPk, reelId, reportKey,
  row_number() OVER (PARTITION BY reportKey, reelId, mediaPk ORDER BY position, label) - 1
FROM labels;
--> statement-breakpoint
-- Recover annotations from both old locations and report snapshots. Earlier caches could lose
-- annotations when reconstructing StoryItem, leaving only the report copy available.
CREATE TABLE `__story_sticker_backfill` AS
WITH annotations AS (
  SELECT mediaPk, label, 0 AS source, sortOrder AS position FROM `story_stickers`
  UNION ALL
  SELECT mediaPk, 'location:' || label, 1, sortOrder FROM `story_locations`
  UNION ALL
  SELECT r.mediaPk, r.label, 2, r.sortOrder FROM `report_story_stickers` r
  WHERE EXISTS (SELECT 1 FROM `stories` s WHERE s.mediaPk = r.mediaPk)
), labels AS (
  SELECT mediaPk, label, min(source) AS source, min(position) AS position
  FROM annotations GROUP BY mediaPk, label
)
SELECT mediaPk, label,
  CASE WHEN instr(label, ':') > 0 THEN substr(label, 1, instr(label, ':') - 1) ELSE 'other' END AS kind,
  row_number() OVER (PARTITION BY mediaPk ORDER BY source, position, label) - 1 AS sortOrder
FROM labels;
--> statement-breakpoint
DELETE FROM `story_stickers`;
--> statement-breakpoint
INSERT INTO `story_stickers` (`mediaPk`, `label`, `kind`, `sortOrder`)
SELECT mediaPk, label, kind, sortOrder FROM `__story_sticker_backfill`;
--> statement-breakpoint
DROP TABLE `__story_sticker_backfill`;
--> statement-breakpoint
DROP TABLE `story_locations`;
--> statement-breakpoint
ALTER TABLE `report_stories` DROP COLUMN `locations`;
--> statement-breakpoint
ALTER TABLE `report_stories` DROP COLUMN `stickers`;
