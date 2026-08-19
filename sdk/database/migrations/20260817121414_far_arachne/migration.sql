PRAGMA foreign_keys=OFF;
--> statement-breakpoint
ALTER TABLE `reports` RENAME TO `reports_legacy`;
--> statement-breakpoint
ALTER TABLE `stories` RENAME TO `stories_legacy`;
--> statement-breakpoint
CREATE TABLE `reports` (
	`broadcastsCount` integer NOT NULL,
	`cacheHits` integer NOT NULL,
	`cacheMisses` integer NOT NULL,
	`createdAt` text NOT NULL,
	`failedCount` integer NOT NULL,
	`fetchedCount` integer NOT NULL,
	`key` text PRIMARY KEY,
	`reelsCount` integer NOT NULL,
	`reportName` text NOT NULL,
	`status` text,
	`storiesCount` integer NOT NULL,
	`storyRankingToken` text
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`accessibilityCaption` text,
	`additionalAttributes` text NOT NULL,
	`id` text,
	`imageVersions` text,
	`mediaPk` text PRIMARY KEY,
	`mediaType` integer,
	`originalHeight` integer,
	`originalWidth` integer,
	`storyBloksStickers` text,
	`storyBloksTappables` text,
	`storyCta` text,
	`storyHashtags` text,
	`storyLinkStickers` text,
	`storyLocations` text,
	`storyMusicStickers` text,
	`textPostShareToIgStoryStickers` text,
	`videoVersions` text
);
--> statement-breakpoint
CREATE TABLE `report_failures` (
	`attemptCount` integer NOT NULL,
	`failureIndex` integer NOT NULL,
	`httpStatus` integer,
	`mediaPk` text,
	`message` text NOT NULL,
	`reason` text NOT NULL,
	`reelId` text NOT NULL,
	`reportKey` text NOT NULL,
	CONSTRAINT `report_failures_pk` PRIMARY KEY(`reportKey`, `failureIndex`),
	CONSTRAINT `fk_report_failures_reportKey_reports_key_fk` FOREIGN KEY (`reportKey`) REFERENCES `reports`(`key`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `report_reels` (
	`fullName` text,
	`instagramId` text,
	`instagramPk` text,
	`profilePicUrl` text,
	`reelId` text NOT NULL,
	`reportKey` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`username` text NOT NULL,
	CONSTRAINT `report_reels_pk` PRIMARY KEY(`reportKey`, `reelId`),
	CONSTRAINT `fk_report_reels_reportKey_reports_key_fk` FOREIGN KEY (`reportKey`) REFERENCES `reports`(`key`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `report_stories` (
	`failureIndex` integer,
	`igCaption` text NOT NULL,
	`locations` text NOT NULL,
	`mediaPk` text NOT NULL,
	`mediaType` text,
	`previewImageUrl` text,
	`reelId` text NOT NULL,
	`reportKey` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`status` text NOT NULL,
	`stickers` text NOT NULL,
	CONSTRAINT `report_stories_pk` PRIMARY KEY(`reportKey`, `reelId`, `mediaPk`),
	CONSTRAINT `fk_report_stories_reportKey_reports_key_fk` FOREIGN KEY (`reportKey`) REFERENCES `reports`(`key`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `stories` (
	`accessibilityCaption`, `additionalAttributes`, `id`, `imageVersions`, `mediaPk`, `mediaType`, `originalHeight`, `originalWidth`, `storyBloksStickers`, `storyBloksTappables`, `storyCta`, `storyHashtags`, `storyLinkStickers`, `storyLocations`, `storyMusicStickers`, `textPostShareToIgStoryStickers`, `videoVersions`
)
SELECT
	json_extract(`data`, '$.accessibility_caption'),
	json_remove(`data`, '$.accessibility_caption', '$.id', '$.image_versions2', '$.media_type', '$.original_height', '$.original_width', '$.pk', '$.story_bloks_stickers', '$.story_bloks_tappables', '$.story_cta', '$.story_hashtags', '$.story_link_stickers', '$.story_locations', '$.story_music_stickers', '$.text_post_share_to_ig_story_stickers', '$.video_versions'),
	json_extract(`data`, '$.id'),
	json_extract(`data`, '$.image_versions2'),
	`mediaPk`,
	json_extract(`data`, '$.media_type'),
	json_extract(`data`, '$.original_height'),
	json_extract(`data`, '$.original_width'),
	json_extract(`data`, '$.story_bloks_stickers'),
	json_extract(`data`, '$.story_bloks_tappables'),
	json_extract(`data`, '$.story_cta'),
	json_extract(`data`, '$.story_hashtags'),
	json_extract(`data`, '$.story_link_stickers'),
	json_extract(`data`, '$.story_locations'),
	json_extract(`data`, '$.story_music_stickers'),
	json_extract(`data`, '$.text_post_share_to_ig_story_stickers'),
	json_extract(`data`, '$.video_versions')
FROM `stories_legacy`;
--> statement-breakpoint
INSERT INTO `reports` (
	`broadcastsCount`, `cacheHits`, `cacheMisses`, `createdAt`, `failedCount`, `fetchedCount`, `key`, `reelsCount`, `reportName`, `status`, `storiesCount`, `storyRankingToken`
)
SELECT
	json_extract(`data`, '$.metadata.broadcasts_count'),
	json_extract(`data`, '$.metadata.counts.cache_hits'),
	json_extract(`data`, '$.metadata.counts.cache_misses'),
	json_extract(`data`, '$.metadata.created_at'),
	json_extract(`data`, '$.metadata.counts.failed'),
	json_extract(`data`, '$.metadata.counts.fetched'),
	`key`,
	json_extract(`data`, '$.metadata.counts.reels'),
	json_extract(`data`, '$.metadata.report_name'),
	json_extract(`data`, '$.metadata.status'),
	json_extract(`data`, '$.metadata.counts.stories'),
	json_extract(`data`, '$.metadata.story_ranking_token')
FROM `reports_legacy`;
--> statement-breakpoint
INSERT INTO `report_reels` (`fullName`, `instagramId`, `instagramPk`, `profilePicUrl`, `reelId`, `reportKey`, `sortOrder`, `username`)
SELECT
	json_extract(reel.value, '$.full_name'),
	json_extract(reel.value, '$.id'),
	json_extract(reel.value, '$.pk'),
	json_extract(reel.value, '$.profile_pic_url'),
	json_extract(reel.value, '$.reel_id'),
	report.`key`,
	json_extract(reel.value, '$.order'),
	json_extract(reel.value, '$.username')
FROM `reports_legacy` AS report, json_each(report.`data`, '$.manifest.users') AS reel;
--> statement-breakpoint
INSERT INTO `report_stories` (`failureIndex`, `igCaption`, `locations`, `mediaPk`, `mediaType`, `previewImageUrl`, `reelId`, `reportKey`, `sortOrder`, `status`, `stickers`)
SELECT
	json_extract(story.value, '$.failure_index'),
	json_extract(story.value, '$.ig_caption'),
	json_extract(story.value, '$.locations'),
	json_extract(story.value, '$.media_pk'),
	json_extract(story.value, '$.media_type'),
	json_extract(story.value, '$.preview_image_url'),
	json_extract(reel.value, '$.reel_id'),
	report.`key`,
	CAST(story.key AS INTEGER),
	json_extract(story.value, '$.status'),
	json_extract(story.value, '$.stickers')
FROM `reports_legacy` AS report, json_each(report.`data`, '$.manifest.users') AS reel, json_each(reel.value, '$.stories') AS story;
--> statement-breakpoint
INSERT INTO `report_failures` (`attemptCount`, `failureIndex`, `httpStatus`, `mediaPk`, `message`, `reason`, `reelId`, `reportKey`)
SELECT
	json_extract(failure.value, '$.attempt_count'),
	CAST(failure.key AS INTEGER),
	json_extract(failure.value, '$.http_status'),
	json_extract(failure.value, '$.media_pk'),
	json_extract(failure.value, '$.message'),
	json_extract(failure.value, '$.reason'),
	json_extract(failure.value, '$.reel_id'),
	report.`key`
FROM `reports_legacy` AS report, json_each(report.`data`, '$.failures') AS failure;
--> statement-breakpoint
DROP TABLE `reports_legacy`;
--> statement-breakpoint
DROP TABLE `stories_legacy`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
