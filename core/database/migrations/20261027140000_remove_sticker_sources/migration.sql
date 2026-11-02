-- A source listed for a story may have been received empty, so it does not
-- establish the provenance of a particular sticker. Only a unique linked
-- observation for the same story and kind supplies that evidence.
UPDATE `story_stickers` AS s
SET `source` = (
  SELECT MIN(o.`source`) FROM (
    SELECT `mediaPk`, `occurrenceId`, `source`, 'location' AS `kind`
    FROM `story_location_observations`
    WHERE `source` IN ('story_locations', 'story_bloks_stickers')
    UNION ALL
    SELECT `mediaPk`, `occurrenceId`, `source`, 'music' AS `kind`
    FROM `story_music_observations`
    WHERE `source` = 'story_music_stickers'
  ) AS o
  WHERE o.`mediaPk` = s.`mediaPk` AND o.`occurrenceId` = s.`occurrenceId` AND o.`kind` = s.`kind`
  HAVING COUNT(DISTINCT o.`source`) = 1
)
WHERE s.`source` = 'unknown'
AND EXISTS (
  SELECT 1 FROM (
    SELECT `mediaPk`, `occurrenceId`, `source`, 'location' AS `kind`
    FROM `story_location_observations`
    WHERE `source` IN ('story_locations', 'story_bloks_stickers')
    UNION ALL
    SELECT `mediaPk`, `occurrenceId`, `source`, 'music' AS `kind`
    FROM `story_music_observations`
    WHERE `source` = 'story_music_stickers'
  ) AS o
  WHERE o.`mediaPk` = s.`mediaPk` AND o.`occurrenceId` = s.`occurrenceId` AND o.`kind` = s.`kind`
  GROUP BY o.`mediaPk`, o.`occurrenceId`, o.`kind`
  HAVING COUNT(DISTINCT o.`source`) = 1
);
--> statement-breakpoint
DROP TABLE `story_sticker_sources`;
