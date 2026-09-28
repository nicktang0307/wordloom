CREATE TABLE `reading_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`body` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_articles_owner_url` ON `reading_articles` (`owner`,`url`);