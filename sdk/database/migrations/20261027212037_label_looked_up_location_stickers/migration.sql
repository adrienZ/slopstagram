-- A lookup that names a place gives each unlinked observation of it a location sticker,
-- labelled name then address like the stickers observed in stories. Places named before
-- this ran have stories showing no location, so give those stories the same sticker.
-- A new sticker takes its observation's id, which is unique and ties the two together.
INSERT INTO `story_stickers` (`occurrenceId`, `providerOccurrenceId`, `kind`, `label`, `mediaPk`, `sortOrder`, `source`)
WITH `labelled` AS (
  SELECT
    o.`id`, o.`mediaPk`, o.`source`, o.`sortOrder`, o.`providerOccurrenceId`,
    CASE
      WHEN NULLIF(l.`name`, '') IS NOT NULL AND NULLIF(l.`address`, '') IS NOT NULL THEN l.`name` || ', ' || l.`address`
      ELSE COALESCE(NULLIF(l.`name`, ''), NULLIF(l.`address`, ''))
    END AS `label`
  FROM `story_location_observations` AS o
  INNER JOIN `metadata_location` AS l ON l.`id` = o.`locationId`
  WHERE o.`occurrenceId` IS NULL
), `candidates` AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (PARTITION BY c.`mediaPk`, c.`label` ORDER BY c.`sortOrder`, c.`id`) AS `firstOfLabel`
  FROM `labelled` AS c
  WHERE c.`label` IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM `story_stickers` AS k
      WHERE k.`mediaPk` = c.`mediaPk` AND k.`kind` = 'location' AND k.`label` = c.`label`
    )
)
SELECT
  `id`, `providerOccurrenceId`, 'location', `label`, `mediaPk`,
  COALESCE((SELECT MAX(k.`sortOrder`) FROM `story_stickers` AS k WHERE k.`mediaPk` = `candidates`.`mediaPk`), -1)
    + ROW_NUMBER() OVER (PARTITION BY `mediaPk` ORDER BY `sortOrder`, `id`),
  `source`
FROM `candidates`
WHERE `firstOfLabel` = 1;
--> statement-breakpoint
UPDATE `story_location_observations`
SET `occurrenceId` = `id`
WHERE `occurrenceId` IS NULL
  AND EXISTS (SELECT 1 FROM `story_stickers` AS k WHERE k.`occurrenceId` = `story_location_observations`.`id`);
