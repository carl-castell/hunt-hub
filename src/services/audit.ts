import { db } from '@/db';
import { auditLogsTable } from '@/db/schema';
import { logError } from '@/utils/logError';

type AuditEvent =
  | 'login'
  | 'failed_login'
  | 'logout'
  | 'account_activated'
  | 'account_locked'
  | 'user_created'
  | 'user_deleted'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'user_resend_activation'
  | 'estate_created'
  | 'estate_deleted'
  | 'invitation_email_sent'
  | 'hibp_service_error'
  | 'failed_totp'
  | 'totp_setup'
  | 'backup_code_used'
  | 'failed_backup_code'
  | 'password_changed'
  | 'license_uploaded'
  | 'license_deleted'
  | 'certificate_uploaded'
  | 'certificate_deleted'
  | 'geofile_uploaded'
  | 'geofile_deleted'
  | 'area_deleted'
  | 'bucket_file_access';

interface AuditOptions {
  userId?: number | null;
  event: AuditEvent;
  ip?: string;
  metadata?: Record<string, unknown>;
}

export async function audit({ userId, event, ip, metadata }: AuditOptions) {
  try {
    await db.insert(auditLogsTable).values({
      userId: userId ?? null,
      event,
      ip,
      metadata: metadata ?? null,
    });
  } catch (err) {
    logError('[audit error]', err);
  }
}
