CREATE TABLE "totp_backup_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "totp_backup_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "totp_backup_codes" ADD CONSTRAINT "totp_backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;