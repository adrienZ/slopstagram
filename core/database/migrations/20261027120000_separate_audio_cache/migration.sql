UPDATE `metadata_music`
SET `audioCachePath` = 'audio/' || substr(`audioCachePath`, 7)
WHERE `audioCachePath` LIKE 'music/%';--> statement-breakpoint
UPDATE `metadata_music_partial`
SET `audioCachePath` = 'audio/' || substr(`audioCachePath`, 7)
WHERE `audioCachePath` LIKE 'music/%';--> statement-breakpoint
UPDATE `story_audio`
SET `cachePath` = 'audio/' || substr(`cachePath`, 7)
WHERE `cachePath` LIKE 'music/%';
