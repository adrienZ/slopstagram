CREATE TABLE `metadata_location_details` (
	`locationId` text PRIMARY KEY,
	`phone` text,
	`priceRange` integer,
	`slug` text,
	`businessAccountId` text,
	`businessAccountUsername` text,
	`businessAccountPictureUrl` text,
	CONSTRAINT `fk_metadata_location_details_locationId_metadata_location_id_fk` FOREIGN KEY (`locationId`) REFERENCES `metadata_location`(`id`) ON DELETE CASCADE,
	CONSTRAINT "location_details_text_nonempty_0" CHECK("phone" IS NULL OR length(trim("phone", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "location_details_text_nonempty_1" CHECK("slug" IS NULL OR length(trim("slug", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "location_details_text_nonempty_2" CHECK("businessAccountId" IS NULL OR length(trim("businessAccountId", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "location_details_text_nonempty_3" CHECK("businessAccountUsername" IS NULL OR length(trim("businessAccountUsername", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
	CONSTRAINT "location_details_text_nonempty_4" CHECK("businessAccountPictureUrl" IS NULL OR length(trim("businessAccountPictureUrl", char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0)
);
