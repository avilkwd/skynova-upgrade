CREATE TABLE `payment_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`changed_at` text NOT NULL,
	`actor_id` text,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_changes_payment` ON `payment_changes` (`payment_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `tax_millis` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `tax_millis` integer;