ALTER TABLE `user_summaries` RENAME COLUMN `userKey` TO `legacyUsername`;--> statement-breakpoint
ALTER TABLE `user_summaries` ADD `instagramUserPk` text REFERENCES instagram_users(pk);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_summaries` (
	`instagramUserPk` text,
	`legacyUsername` text,
	`promptHash` text NOT NULL,
	`result` text NOT NULL,
	`sourceHash` text PRIMARY KEY,
	CONSTRAINT `fk_user_summaries_instagramUserPk_instagram_users_pk_fk` FOREIGN KEY (`instagramUserPk`) REFERENCES `instagram_users`(`pk`),
	CONSTRAINT "user_summaries_owner_check" CHECK(("instagramUserPk" IS NOT NULL AND "legacyUsername" IS NULL) OR ("instagramUserPk" IS NULL AND "legacyUsername" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_user_summaries`(`promptHash`, `result`, `sourceHash`, `legacyUsername`) SELECT `promptHash`, `result`, `sourceHash`, `legacyUsername` FROM `user_summaries`;--> statement-breakpoint
DROP TABLE `user_summaries`;--> statement-breakpoint
ALTER TABLE `__new_user_summaries` RENAME TO `user_summaries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `user_summaries_instagram_user_pk_index` ON `user_summaries` (`instagramUserPk`);
--> statement-breakpoint
-- Link only exact, unique username matches; keep unresolved history intact.
UPDATE `user_summaries`
SET `instagramUserPk` = (
  SELECT `pk` FROM `instagram_users`
  WHERE `instagram_users`.`username` = `user_summaries`.`legacyUsername`
), `legacyUsername` = NULL
WHERE `instagramUserPk` IS NULL
  AND (SELECT COUNT(*) FROM `instagram_users`
       WHERE `instagram_users`.`username` = `user_summaries`.`legacyUsername`) = 1;
