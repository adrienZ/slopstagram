-- DRAFT ONLY: for the working database that received the accidental 20261022085148 migration.
-- Do not run on an unmigrated database. Review and test on a backup before applying.
-- This restores the agreed report storage and leaves the normalized source table intact.
BEGIN IMMEDIATE;

ALTER TABLE `report_stories` ADD `locations` text NOT NULL DEFAULT '[]';
ALTER TABLE `report_stories` ADD `stickers` text NOT NULL DEFAULT '[]';

UPDATE `report_stories` AS story
SET `locations` = (
  SELECT json_group_array(label) FROM (
    SELECT substr(annotation.label, length('location:') + 1) AS label
    FROM `report_story_stickers` annotation
    WHERE annotation.reportKey = story.reportKey
      AND annotation.reelId = story.reelId
      AND annotation.mediaPk = story.mediaPk
      AND annotation.kind = 'location'
    ORDER BY annotation.sortOrder
  )
), `stickers` = (
  SELECT json_group_array(label) FROM (
    SELECT annotation.label
    FROM `report_story_stickers` annotation
    WHERE annotation.reportKey = story.reportKey
      AND annotation.reelId = story.reelId
      AND annotation.mediaPk = story.mediaPk
      AND annotation.kind <> 'location'
    ORDER BY annotation.sortOrder
  )
);

ALTER TABLE `report_reels` RENAME TO `report_story_groups`;

COMMIT;

-- Keep report_story_stickers as a recovery source until the restored data is verified.
-- Migration journal reconciliation is a separate reviewed step, not performed by this draft.
