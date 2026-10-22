CREATE TABLE `apple_vision` (
	`caption` text NOT NULL,
	`mediaPk` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_summaries` (
	`prompt` text NOT NULL,
	`result` text NOT NULL,
	`sourceHash` text PRIMARY KEY NOT NULL,
	`userKey` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vision` (
	`mediaPk` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`promptHash` text NOT NULL,
	`text` text NOT NULL,
	`visual` text NOT NULL
);
