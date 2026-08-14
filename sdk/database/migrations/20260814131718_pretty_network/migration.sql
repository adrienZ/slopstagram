ALTER TABLE `user_summaries` RENAME COLUMN `prompt` TO `promptHash`;
--> statement-breakpoint
UPDATE `user_summaries`
SET `promptHash` = 'b176415edb494ee2c9379d671095b4db21a314fe1d9f5f61c94fb671a7cb977d';
--> statement-breakpoint
UPDATE `user_summaries`
SET `userKey` = substr(`userKey`, 10)
WHERE `userKey` LIKE 'username:%';
