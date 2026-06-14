ALTER TABLE `apps` ADD `active_deployment_id` text;--> statement-breakpoint
ALTER TABLE `apps` ADD `env` text DEFAULT '{}' NOT NULL;