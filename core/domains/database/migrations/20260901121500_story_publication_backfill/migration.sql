UPDATE `stories`
SET `takenAt` = ((CAST(`mediaPk` AS INTEGER) >> 23) + 1314220021721) / 1000
WHERE `takenAt` IS NULL
	AND length(`mediaPk`) > 15
	AND `mediaPk` NOT GLOB '*[^0-9]*';
--> statement-breakpoint
UPDATE `stories` AS story
SET
	`ownerFullName` = (
		SELECT user.`fullName`
		FROM `instagram_users` AS user
		WHERE user.`id` = substr(story.`id`, instr(story.`id`, '_') + 1)
	),
	`ownerPk` = (
		SELECT user.`pk`
		FROM `instagram_users` AS user
		WHERE user.`id` = substr(story.`id`, instr(story.`id`, '_') + 1)
	),
	`username` = (
		SELECT user.`username`
		FROM `instagram_users` AS user
		WHERE user.`id` = substr(story.`id`, instr(story.`id`, '_') + 1)
	)
WHERE `username` IS NULL
	AND EXISTS (
		SELECT 1
		FROM `instagram_users` AS user
		WHERE user.`id` = substr(story.`id`, instr(story.`id`, '_') + 1)
	);
