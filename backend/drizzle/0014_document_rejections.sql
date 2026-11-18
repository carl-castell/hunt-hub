CREATE TYPE "public"."document_kind" AS ENUM('licence', 'certificate');--> statement-breakpoint
CREATE TABLE "document_rejections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_rejections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"estate_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"kind" "document_kind" NOT NULL,
	"reason" text NOT NULL,
	"rejected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_rejections" ADD CONSTRAINT "document_rejections_estate_id_estates_id_fk" FOREIGN KEY ("estate_id") REFERENCES "public"."estates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_rejections" ADD CONSTRAINT "document_rejections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_document_rejections_user" ON "document_rejections" USING btree ("user_id","kind");