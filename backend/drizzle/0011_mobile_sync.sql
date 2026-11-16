CREATE TABLE "mobile_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"device_name" varchar(255),
	"access_token_hash" varchar(64) NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_token_hash" varchar(64) NOT NULL,
	"prev_refresh_token_hash" varchar(64),
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "mobile_sessions_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "mobile_sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash"),
	CONSTRAINT "mobile_sessions_prev_refresh_token_hash_unique" UNIQUE("prev_refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(64) NOT NULL,
	"status" varchar(16) NOT NULL,
	"result" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_tombstones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_tombstones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"entity" varchar(32) NOT NULL,
	"entity_id" integer NOT NULL,
	"estate_id" integer NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mobile_sessions_user_id" ON "mobile_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sync_tombstones_estate_deleted" ON "sync_tombstones" USING btree ("estate_id","deleted_at");--> statement-breakpoint
-- Keep updated_at current on every real change, no matter which code path writes (manager UI, WFS-T, mobile sync).
-- An UPDATE that sets updated_at itself keeps that value.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER areas_set_updated_at BEFORE UPDATE ON "areas" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER stands_set_updated_at BEFORE UPDATE ON "stands" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Record hard deletes so mobile clients can remove them locally.
CREATE OR REPLACE FUNCTION record_area_tombstone() RETURNS trigger AS $$
BEGIN
  INSERT INTO sync_tombstones (entity, entity_id, estate_id) VALUES ('area', OLD.id, OLD.estate_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- When a stand is removed by an area's ON DELETE CASCADE the area row is already gone,
-- so nothing is recorded; clients drop an area's stands when they receive the area tombstone.
CREATE OR REPLACE FUNCTION record_stand_tombstone() RETURNS trigger AS $$
BEGIN
  INSERT INTO sync_tombstones (entity, entity_id, estate_id)
  SELECT 'stand', OLD.id, a.estate_id FROM areas a WHERE a.id = OLD.area_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER areas_record_tombstone AFTER DELETE ON "areas" FOR EACH ROW EXECUTE FUNCTION record_area_tombstone();
--> statement-breakpoint
CREATE TRIGGER stands_record_tombstone AFTER DELETE ON "stands" FOR EACH ROW EXECUTE FUNCTION record_stand_tombstone();
