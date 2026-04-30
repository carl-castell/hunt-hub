CREATE INDEX "idx_users_estate_id" ON "users" USING btree ("estate_id");--> statement-breakpoint
CREATE INDEX "idx_users_estate_role" ON "users" USING btree ("estate_id","role");--> statement-breakpoint
CREATE INDEX "idx_users_firstname_trgm" ON "users" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_users_lastname_trgm" ON "users" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_drives_event_id" ON "drives" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_events_estate_id" ON "events" USING btree ("estate_id");--> statement-breakpoint
CREATE INDEX "idx_invitations_event_status" ON "invitations" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "idx_invitations_user_id" ON "invitations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_stands_area_id" ON "stands" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "idx_areas_estate_id" ON "areas" USING btree ("estate_id");--> statement-breakpoint
CREATE INDEX "idx_user_auth_tokens_user_id" ON "user_auth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_templates_estate_id" ON "templates" USING btree ("estate_id");--> statement-breakpoint
CREATE INDEX "idx_template_groups_template_id" ON "template_groups" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_tsa_template_id" ON "template_stand_assignments" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_tsa_stand_id" ON "template_stand_assignments" USING btree ("stand_id");--> statement-breakpoint
CREATE INDEX "idx_drive_groups_drive_id" ON "drive_groups" USING btree ("drive_id");--> statement-breakpoint
CREATE INDEX "idx_dsa_drive_id" ON "drive_stand_assignments" USING btree ("drive_id");--> statement-breakpoint
CREATE INDEX "idx_dsa_drive_group_id" ON "drive_stand_assignments" USING btree ("drive_group_id");--> statement-breakpoint
CREATE INDEX "idx_dsa_user_id" ON "drive_stand_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_guest_groups_estate_id" ON "guest_groups" USING btree ("estate_id");--> statement-breakpoint
CREATE INDEX "idx_guest_groups_name_trgm" ON "guest_groups" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_totp_backup_codes_user_id" ON "totp_backup_codes" USING btree ("user_id");