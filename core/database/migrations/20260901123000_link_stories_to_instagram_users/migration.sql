UPDATE `stories`
SET `instagramUserPk` = `ownerPk`
WHERE `instagramUserPk` IS NULL
	AND `ownerPk` IS NOT NULL
	AND EXISTS (
		SELECT 1
		FROM `instagram_users` AS user
		WHERE user.`pk` = `stories`.`ownerPk`
	);
