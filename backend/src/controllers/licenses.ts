import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { usersTable } from '../db/schema/users';
import { contactsTable } from '../db/schema/contacts';
import {
  huntingLicensesTable, huntingLicenseAttachmentsTable,
  trainingCertificatesTable, trainingCertificateAttachmentsTable,
} from '../db/schema/licenses';
import { uploadFile } from '@/services/storage';
import { audit } from '@/services/audit';
import { z } from 'zod';
import { logError } from '@/utils/logError';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_PDF_TYPE = 'application/pdf';

function safeFilename(name: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(name); } catch { decoded = name; }
  return decoded.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_');
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const licenseSchema = z.object({
  expiryDate: z
    .string()
    .min(1)
    .refine((v) => {
      // v is "YYYY-MM-DD" from <input type="date">
      const d = new Date(`${v}T00:00:00Z`);
      if (isNaN(d.getTime())) return false;

      const today = new Date();
      const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

      // expiry must be today or in the future
      return d.getTime() >= todayUtc.getTime();
    }, 'Expiry date cannot be in the past'),
});


const certSchema = z.object({
  issueDate: z
    .string()
    .min(1)
    .refine((v) => {
      // v is "YYYY-MM-DD" from <input type="date">
      const d = new Date(`${v}T00:00:00Z`);
      if (isNaN(d.getTime())) return false;

      const today = new Date();
      const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

      return d.getTime() <= todayUtc.getTime();
    }, 'Issue date cannot be in the future'),
});


// ── Helpers ───────────────────────────────────────────────────────────────────

async function getGuestRow(id: number, estateId: number) {
  const [row] = await db
    .select()
    .from(contactsTable)
    .innerJoin(usersTable, eq(contactsTable.userId, usersTable.id))
    .where(eq(contactsTable.userId, id))
    .limit(1);
  if (!row || row.users.estateId !== estateId) return null;
  return { ...row.users, ...row.contacts };
}

function validateFiles(files: Express.Multer.File[], maxImages: number): string | null {
  if (!files || files.length === 0) return 'At least one file is required';
  const isPdf = files.length === 1 && files[0].mimetype === ALLOWED_PDF_TYPE;
  const areImages = files.every(f => ALLOWED_IMAGE_TYPES.includes(f.mimetype));
  if (!isPdf && !areImages) return 'Upload either one PDF or images (JPEG, PNG, WEBP, HEIC)';
  if (areImages && files.length > maxImages) return `Maximum ${maxImages} images allowed`;
  return null;
}

// ── Hunting License ───────────────────────────────────────────────────────────

export async function postCreateHuntingLicense(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const result = licenseSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    const files = req.files as Express.Multer.File[];
    const validationError = validateFiles(files, 4);
    if (validationError) return res.status(400).send(validationError);

    const [license] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(huntingLicensesTable)
        .values({ userId: id, estateId: user.estateId!, expiryDate: result.data.expiryDate })
        .returning();

      for (const file of files) {
        const key = `licenses/hunting/${created.id}/${safeFilename(file.originalname)}`;
        await uploadFile(key, file.buffer, file.mimetype);
        await tx.insert(huntingLicenseAttachmentsTable).values({
          licenseId: created.id,
          kind: file.mimetype === ALLOWED_PDF_TYPE ? 'document' : 'photo',
          key,
          contentType: file.mimetype,
          originalName: file.originalname,
          sizeBytes: file.size,
        });
      }

      return [created];
    });

    await audit({ userId: user.id, event: 'license_uploaded', ip: req.ip, metadata: { guestId: id, licenseId: license.id } });
    res.redirect(`/manager/guests/${id}/hunting-license?licenseId=${license.id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

// ── Training Certificate ──────────────────────────────────────────────────────

export async function postCreateTrainingCertificate(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const result = certSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    const files = req.files as Express.Multer.File[];
    const validationError = validateFiles(files, 2);
    if (validationError) return res.status(400).send(validationError);

    const [certificate] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(trainingCertificatesTable)
        .values({ userId: id, estateId: user.estateId!, issueDate: result.data.issueDate })
        .returning();

      for (const file of files) {
        const key = `certificates/${created.id}/${safeFilename(file.originalname)}`;
        await uploadFile(key, file.buffer, file.mimetype);
        await tx.insert(trainingCertificateAttachmentsTable).values({
          certId: created.id,
          kind: file.mimetype === ALLOWED_PDF_TYPE ? 'document' : 'photo',
          key,
          contentType: file.mimetype,
          originalName: file.originalname,
          sizeBytes: file.size,
        });
      }

      return [created];
    });

    await audit({ userId: user.id, event: 'certificate_uploaded', ip: req.ip, metadata: { guestId: id, certId: certificate.id } });
    res.redirect(`/manager/guests/${id}/training-certificate?certId=${certificate.id}`);
  } catch (err) {
    logError('[error]', err);
    res.status(500).send('Server error');
  }
}

