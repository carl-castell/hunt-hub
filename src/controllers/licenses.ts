import { Request, Response } from 'express';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { db } from '../db';
import { usersTable } from '../db/schema/users';
import { contactsTable } from '../db/schema/contacts';
import {
  huntingLicensesTable, huntingLicenseAttachmentsTable,
  trainingCertificatesTable, trainingCertificateAttachmentsTable,
} from '../db/schema/licenses';
import { uploadFile, deleteFile } from '@/services/storage';
import { audit } from '@/services/audit';
import { z } from 'zod';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_PDF_TYPE = 'application/pdf';

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_');
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

async function deleteLicense(licenseId: number): Promise<void> {
  const attachments = await db
    .select()
    .from(huntingLicenseAttachmentsTable)
    .where(eq(huntingLicenseAttachmentsTable.licenseId, licenseId));
  for (const attachment of attachments) await deleteFile(attachment.key);
  await db.delete(huntingLicensesTable).where(eq(huntingLicensesTable.id, licenseId));
}

async function deleteCertificate(certId: number): Promise<void> {
  const attachments = await db
    .select()
    .from(trainingCertificateAttachmentsTable)
    .where(eq(trainingCertificateAttachmentsTable.certId, certId));
  for (const attachment of attachments) await deleteFile(attachment.key);
  await db.delete(trainingCertificatesTable).where(eq(trainingCertificatesTable.id, certId));
}

// ── Hunting License ───────────────────────────────────────────────────────────

export async function getHuntingLicense(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const requestedId = req.query.licenseId ? Number(req.query.licenseId) : null;

    let license =
      requestedId
        ? (await db
            .select()
            .from(huntingLicensesTable)
            .where(and(
              eq(huntingLicensesTable.id, requestedId),
              eq(huntingLicensesTable.userId, id),
              eq(huntingLicensesTable.estateId, user.estateId!),
            ))
            .limit(1))[0]
        : undefined;

    if (!license) {
      license = (await db
        .select()
        .from(huntingLicensesTable)
        .where(and(
          eq(huntingLicensesTable.userId, id),
          eq(huntingLicensesTable.estateId, user.estateId!),
        ))
        .orderBy(desc(huntingLicensesTable.uploadDate))
        .limit(1))[0];
    }

    if (!license) return res.redirect(`/manager/guests/${id}`);

    const attachments = await db
      .select()
      .from(huntingLicenseAttachmentsTable)
      .where(eq(huntingLicenseAttachmentsTable.licenseId, license.id))
      .orderBy(desc(huntingLicenseAttachmentsTable.uploadDate));

    res.render('manager/guests/hunting-license', {
      title: 'Hunting License',
      user,
      guest,
      license: { ...license, attachments },
      breadcrumbs: [{ label: 'Guests', href: '/manager/guests' }, { label: `${guest.firstName} ${guest.lastName}`, href: `/manager/guests/${guest.id}` }, { label: 'Hunting License' }],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

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
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postCheckHuntingLicense(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const licenseId = Number(req.body.licenseId);
    if (!licenseId) return res.status(400).send('License ID is required');

    const [license] = await db
      .select()
      .from(huntingLicensesTable)
      .where(eq(huntingLicensesTable.id, licenseId))
      .limit(1);

    if (!license || license.userId !== id || license.estateId !== user.estateId!) {
      return res.status(404).send('License not found');
    }

    const allLicenses = await db.select().from(huntingLicensesTable).where(eq(huntingLicensesTable.userId, id));
    const oldLicenses = allLicenses.filter(l => l.id !== licenseId);

    // Collect S3 keys before the transaction so we can clean up after commit
    const oldAttachmentKeys = oldLicenses.length > 0
      ? (await db.select().from(huntingLicenseAttachmentsTable)
          .where(inArray(huntingLicenseAttachmentsTable.licenseId, oldLicenses.map(l => l.id))))
          .map(a => a.key)
      : [];

    await db.transaction(async (tx) => {
      await tx.update(huntingLicensesTable).set({ checked: true, checkedAt: new Date() }).where(eq(huntingLicensesTable.id, licenseId));
      for (const old of oldLicenses) {
        await tx.delete(huntingLicensesTable).where(eq(huntingLicensesTable.id, old.id));
      }
    });

    for (const key of oldAttachmentKeys) await deleteFile(key);

    res.redirect(`/manager/guests/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postDeleteHuntingLicense(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const licenseId = Number(req.body.licenseId);
    if (!licenseId) return res.status(400).send('License ID is required');

    const [license] = await db
      .select()
      .from(huntingLicensesTable)
      .where(eq(huntingLicensesTable.id, licenseId))
      .limit(1);

    if (!license || license.userId !== id || license.estateId !== user.estateId!) {
      return res.status(404).send('License not found');
    }

    await deleteLicense(licenseId);

    await audit({ userId: user.id, event: 'license_deleted', ip: req.ip, metadata: { guestId: id, licenseId } });
    res.redirect(`/manager/guests/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postUpdateHuntingLicense(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const licenseId = Number(req.body.licenseId);
    if (!licenseId) return res.status(400).send('License ID is required');

    const [license] = await db
      .select()
      .from(huntingLicensesTable)
      .where(eq(huntingLicensesTable.id, licenseId))
      .limit(1);

    if (!license || license.userId !== id || license.estateId !== user.estateId!) {
      return res.status(404).send('License not found');
    }

    const result = licenseSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    await db
      .update(huntingLicensesTable)
      .set({
        expiryDate: result.data.expiryDate,
        ...(!license.checked && { checked: true, checkedAt: new Date() }),
      })
      .where(eq(huntingLicensesTable.id, licenseId));

    res.redirect(`/manager/guests/${id}/hunting-license?licenseId=${licenseId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

// ── Training Certificate ──────────────────────────────────────────────────────

export async function getTrainingCertificate(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const requestedId = req.query.certId ? Number(req.query.certId) : null;

    let certificate =
      requestedId
        ? (await db
            .select()
            .from(trainingCertificatesTable)
            .where(and(
              eq(trainingCertificatesTable.id, requestedId),
              eq(trainingCertificatesTable.userId, id),
              eq(trainingCertificatesTable.estateId, user.estateId!),
            ))
            .limit(1))[0]
        : undefined;

    if (!certificate) {
      certificate = (await db
        .select()
        .from(trainingCertificatesTable)
        .where(and(
          eq(trainingCertificatesTable.userId, id),
          eq(trainingCertificatesTable.estateId, user.estateId!),
        ))
        .orderBy(desc(trainingCertificatesTable.uploadDate))
        .limit(1))[0];
    }

    if (!certificate) return res.redirect(`/manager/guests/${id}`);

    const attachments = await db
      .select()
      .from(trainingCertificateAttachmentsTable)
      .where(eq(trainingCertificateAttachmentsTable.certId, certificate.id))
      .orderBy(desc(trainingCertificateAttachmentsTable.uploadDate));

    res.render('manager/guests/training-certificate', {
      title: 'Training Certificate',
      user,
      guest,
      certificate: { ...certificate, attachments },
      breadcrumbs: [{ label: 'Guests', href: '/manager/guests' }, { label: `${guest.firstName} ${guest.lastName}`, href: `/manager/guests/${guest.id}` }, { label: 'Training Certificate' }],
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

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
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postCheckTrainingCertificate(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const certId = Number(req.body.certId);
    if (!certId) return res.status(400).send('Certificate ID is required');

    const [certificate] = await db
      .select()
      .from(trainingCertificatesTable)
      .where(eq(trainingCertificatesTable.id, certId))
      .limit(1);

    if (!certificate || certificate.userId !== id || certificate.estateId !== user.estateId!) {
      return res.status(404).send('Certificate not found');
    }

    const allCertificates = await db.select().from(trainingCertificatesTable).where(eq(trainingCertificatesTable.userId, id));
    const oldCertificates = allCertificates.filter(c => c.id !== certId);

    const oldAttachmentKeys = oldCertificates.length > 0
      ? (await db.select().from(trainingCertificateAttachmentsTable)
          .where(inArray(trainingCertificateAttachmentsTable.certId, oldCertificates.map(c => c.id))))
          .map(a => a.key)
      : [];

    await db.transaction(async (tx) => {
      await tx.update(trainingCertificatesTable).set({ checked: true, checkedAt: new Date() }).where(eq(trainingCertificatesTable.id, certId));
      for (const old of oldCertificates) {
        await tx.delete(trainingCertificatesTable).where(eq(trainingCertificatesTable.id, old.id));
      }
    });

    for (const key of oldAttachmentKeys) await deleteFile(key);

    res.redirect(`/manager/guests/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postDeleteTrainingCertificate(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const certId = Number(req.body.certId);
    if (!certId) return res.status(400).send('Certificate ID is required');

    const [certificate] = await db
      .select()
      .from(trainingCertificatesTable)
      .where(eq(trainingCertificatesTable.id, certId))
      .limit(1);

    if (!certificate || certificate.userId !== id || certificate.estateId !== user.estateId!) {
      return res.status(404).send('Certificate not found');
    }

    await deleteCertificate(certId);

    await audit({ userId: user.id, event: 'certificate_deleted', ip: req.ip, metadata: { guestId: id, certId } });
    res.redirect(`/manager/guests/${id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postUpdateTrainingCertificate(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const id = Number(req.params.id);
    const guest = await getGuestRow(id, user.estateId!);
    if (!guest) return res.status(404).send('Guest not found');

    const certId = Number(req.body.certId);
    if (!certId) return res.status(400).send('Certificate ID is required');

    const [certificate] = await db
      .select()
      .from(trainingCertificatesTable)
      .where(eq(trainingCertificatesTable.id, certId))
      .limit(1);

    if (!certificate || certificate.userId !== id || certificate.estateId !== user.estateId!) {
      return res.status(404).send('Certificate not found');
    }

    const result = certSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error.issues[0].message);

    await db
      .update(trainingCertificatesTable)
      .set({
        issueDate: result.data.issueDate,
        ...(!certificate.checked && { checked: true, checkedAt: new Date() }),
      })
      .where(eq(trainingCertificatesTable.id, certId));

    res.redirect(`/manager/guests/${id}/training-certificate?certId=${certId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}
