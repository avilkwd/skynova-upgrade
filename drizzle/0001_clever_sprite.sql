CREATE INDEX `jobs_customer_date` ON `jobs` (`customer_id`,`date`);--> statement-breakpoint
CREATE INDEX `jobs_vehicle_date` ON `jobs` (`vehicle_id`,`date`);--> statement-breakpoint
CREATE INDEX `payments_job` ON `payments` (`job_id`);