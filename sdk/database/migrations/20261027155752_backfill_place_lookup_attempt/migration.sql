-- Places stored before place lookups existed have no attempt time. Date them by
-- their earliest story (milliseconds, like lookups record), so ingestion treats
-- them as already attempted and leaves them to a one-time local backfill.
UPDATE `metadata_location`
SET `lastLookupAttemptAt` = (
  SELECT MIN(s.`takenAt`) * 1000
  FROM `story_location_observations` AS o
  INNER JOIN `stories` AS s ON s.`mediaPk` = o.`mediaPk`
  WHERE o.`locationId` = `metadata_location`.`id` AND s.`takenAt` IS NOT NULL
)
WHERE `lastLookupAttemptAt` IS NULL;
