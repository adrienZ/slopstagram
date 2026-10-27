-- Mention bloks stickers were stored as tagged places using the sticker's own
-- generic identifier as place id. Remove those phantom places and their observations.
DELETE FROM `story_location_observations`
WHERE `partialLocationId` IN (
  SELECT `id` FROM `metadata_location_partial` WHERE `instagramPlaceId` = 'bloks_sticker_id'
)
OR `locationId` IN (
  SELECT `id` FROM `metadata_location` WHERE `instagramPlaceId` = 'bloks_sticker_id'
);--> statement-breakpoint
DELETE FROM `metadata_location_partial` WHERE `instagramPlaceId` = 'bloks_sticker_id';--> statement-breakpoint
DELETE FROM `metadata_location` WHERE `instagramPlaceId` = 'bloks_sticker_id';
