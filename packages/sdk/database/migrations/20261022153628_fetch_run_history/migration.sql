CREATE TABLE `fetch_runs` (
	`id` text PRIMARY KEY,
	`startedAt` text NOT NULL,
	`finishedAt` text,
	`status` text NOT NULL,
	`error` text,
	`reportKey` text,
	`storiesCount` integer,
	`reelsCount` integer,
	`fetchedCount` integer,
	`cacheHits` integer,
	`cacheMisses` integer,
	`failedCount` integer,
	CONSTRAINT `fk_fetch_runs_reportKey_reports_key_fk` FOREIGN KEY (`reportKey`) REFERENCES `reports`(`key`) ON DELETE SET NULL
);
