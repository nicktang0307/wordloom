CREATE TABLE `words` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`word` text NOT NULL,
	`meaning` text NOT NULL,
	`zh` text NOT NULL,
	`context` text NOT NULL,
	`source` text NOT NULL,
	`due` integer NOT NULL,
	`stage` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `words_owner_word` ON `words` (`owner`,`word`);