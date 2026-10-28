-- The previous migration gave an unlinked observation a "name, address" sticker without noticing
-- that its story already showed the place under its name alone, in an older sticker no
-- observation was linked to. Keep that older sticker, link it, and drop the added one.
-- The added stickers are those whose id is their observation's id.
CREATE TEMP TABLE `__legacy_location_sticker_pairs` AS
SELECT d.`occurrenceId` AS `addedId`, MIN(k.`occurrenceId`) AS `legacyId`
FROM `story_stickers` AS d
INNER JOIN `story_location_observations` AS o ON o.`id` = d.`occurrenceId` AND o.`occurrenceId` = d.`occurrenceId`
INNER JOIN `metadata_location` AS l ON l.`id` = o.`locationId`
INNER JOIN `story_stickers` AS k
  ON k.`mediaPk` = d.`mediaPk` AND k.`kind` = 'location' AND k.`source` = 'unknown' AND k.`occurrenceId` <> d.`occurrenceId`
WHERE NOT EXISTS (SELECT 1 FROM `story_location_observations` AS c WHERE c.`occurrenceId` = k.`occurrenceId`)
  AND lower(trim(k.`label`)) IN (lower(trim(d.`label`)), lower(trim(l.`name`)))
GROUP BY d.`occurrenceId`;
--> statement-breakpoint
UPDATE `story_location_observations`
SET `occurrenceId` = (
  SELECT p.`legacyId` FROM `__legacy_location_sticker_pairs` AS p WHERE p.`addedId` = `story_location_observations`.`id`
)
WHERE `id` IN (SELECT `addedId` FROM `__legacy_location_sticker_pairs`);
--> statement-breakpoint
DELETE FROM `story_stickers` WHERE `occurrenceId` IN (SELECT `addedId` FROM `__legacy_location_sticker_pairs`);
--> statement-breakpoint
DROP TABLE `__legacy_location_sticker_pairs`;
