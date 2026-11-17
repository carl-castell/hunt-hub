CREATE TYPE "public"."stand_status" AS ENUM('ok', 'needs_repair', 'broken', 'removed');--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "nickname" varchar(64);--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "status" "stand_status";--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "status_date" date;--> statement-breakpoint
-- Written by hand: a status date only makes sense together with a status.
ALTER TABLE "stands" ADD CONSTRAINT "stands_status_date_needs_status" CHECK ("status" IS NOT NULL OR "status_date" IS NULL);
