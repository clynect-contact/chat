CREATE TABLE `copilot_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`purpose` text NOT NULL,
	`object_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `copilot_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`tenant` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversation_owner` ON `copilot_conversations` (`owner`,`tenant`);--> statement-breakpoint
CREATE TABLE `copilot_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`tenant` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_draft_owner` ON `copilot_drafts` (`owner`,`tenant`);--> statement-breakpoint
CREATE TABLE `copilot_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`event` text NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_event_owner_date` ON `copilot_events` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `copilot_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`tenant` text NOT NULL,
	`purpose` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`extracted_text` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_file_owner` ON `copilot_files` (`owner`,`tenant`);--> statement-breakpoint
CREATE TABLE `copilot_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `copilot_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`conversation_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_request_owner_date` ON `copilot_requests` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `copilot_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`authenticated` integer DEFAULT 0 NOT NULL,
	`role` text DEFAULT 'anonymous' NOT NULL,
	`locale` text DEFAULT 'fr' NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `copilot_tool_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`tool` text NOT NULL,
	`input_hash` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tool_owner` ON `copilot_tool_runs` (`owner`);