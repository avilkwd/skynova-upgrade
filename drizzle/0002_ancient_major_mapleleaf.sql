ALTER TABLE `jobs` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `source_invoice_id` text REFERENCES jobs(id);--> statement-breakpoint
CREATE INDEX `jobs_source_invoice` ON `jobs` (`source_invoice_id`);