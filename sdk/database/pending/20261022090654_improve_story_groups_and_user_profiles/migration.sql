-- DRAFT: for databases that have NOT received the earlier accidental draft.
-- Keep outside sdk/database/migrations until the backfill review is complete.
ALTER TABLE `report_reels` RENAME TO `report_story_groups`;
--> statement-breakpoint
ALTER TABLE `instagram_users` ADD `biography` text;
--> statement-breakpoint
-- Resolve only unambiguous usernames. Keep unmatched historical identities for later review.
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
-- Recover canonical annotations from existing stickers, locations, and report snapshots.
-- Report snapshot columns and their original array values remain unchanged.
CREATE TABLE `__story_sticker_backfill` AS
WITH annotations AS (
  SELECT mediaPk, label, 0 AS source, sortOrder AS position FROM `story_stickers`
  UNION ALL
  SELECT mediaPk, 'location:' || label, 1, sortOrder FROM `story_locations`
  UNION ALL
  SELECT r.mediaPk, a.value, 2, CAST(a.key AS INTEGER)
  FROM `report_stories` r, json_each(r.stickers) a
  WHERE EXISTS (SELECT 1 FROM `stories` s WHERE s.mediaPk = r.mediaPk)
  UNION ALL
  SELECT r.mediaPk, 'location:' || a.value, 3, CAST(a.key AS INTEGER)
  FROM `report_stories` r, json_each(r.locations) a
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
