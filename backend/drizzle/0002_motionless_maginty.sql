CREATE INDEX "idx_ggm_group_id" ON "guest_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_ggm_user_id" ON "guest_group_members" USING btree ("user_id");