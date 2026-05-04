ALTER TABLE "stands" ALTER COLUMN "location" SET DATA TYPE geometry(Point, 4326) USING CASE WHEN "location" IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint("location"[0], "location"[1]), 4326) END;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "wfs_token" varchar(64);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_wfs_token_unique" UNIQUE("wfs_token");