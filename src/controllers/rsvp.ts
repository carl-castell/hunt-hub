import { Request, Response } from 'express';
import { and, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { invitationsTable } from '../db/schema/invitations';
import { usersTable } from '../db/schema/users';
import { eventsTable } from '../db/schema/events';
import { drivesTable } from '../db/schema/drives';
import { contactsTable } from '../db/schema/contacts';
import {
  huntingLicensesTable, huntingLicenseAttachmentsTable,
  trainingCertificatesTable, trainingCertificateAttachmentsTable,
} from '../db/schema/licenses';
import { uploadFile } from '../services/storage';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_PDF_TYPE = 'application/pdf';

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_');
}

const licenseSchema = z.object({
  expiryDate: z.string().min(1).refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    return d.getTime() >= todayUtc.getTime();
  }, 'Expiry date cannot be in the past'),
});

const certSchema = z.object({
  issueDate: z.string().min(1).refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    return d.getTime() <= todayUtc.getTime();
  }, 'Issue date cannot be in the future'),
});

const detailsSchema = z.object({
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
});

function validateFiles(files: Express.Multer.File[], maxImages: number): string | null {
  if (!files || files.length === 0) return 'At least one file is required';
  const isPdf = files.length === 1 && files[0].mimetype === ALLOWED_PDF_TYPE;
  const areImages = files.every(f => ALLOWED_IMAGE_TYPES.includes(f.mimetype));
  if (!isPdf && !areImages) return 'Upload either one PDF or images (JPEG, PNG, WEBP, HEIC)';
  if (areImages && files.length > maxImages) return `Maximum ${maxImages} images allowed`;
  return null;
}

async function findInvitation(publicId: string) {
  const [row] = await db
    .select({
      id: invitationsTable.id,
      publicId: invitationsTable.publicId,
      response: invitationsTable.response,
      respondBy: invitationsTable.respondBy,
      respondedAt: invitationsTable.respondedAt,
      openedAt: invitationsTable.openedAt,
      userId: invitationsTable.userId,
      eventId: invitationsTable.eventId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      eventName: eventsTable.eventName,
      eventDate: eventsTable.date,
      eventTime: eventsTable.time,
      estateId: eventsTable.estateId,
    })
    .from(invitationsTable)
    .innerJoin(usersTable, eq(invitationsTable.userId, usersTable.id))
    .innerJoin(eventsTable, eq(invitationsTable.eventId, eventsTable.id))
    .where(eq(invitationsTable.publicId, publicId))
    .limit(1);
  return row ?? null;
}

export async function getRsvp(req: Request, res: Response) {
  try {
    const invitation = await findInvitation(req.params.publicId);
    if (!invitation) return res.status(404).send('Invitation not found');

    if (!invitation.openedAt) {
      await db
        .update(invitationsTable)
        .set({ openedAt: new Date() })
        .where(eq(invitationsTable.id, invitation.id));
    }

    const drives = await db
      .select({ name: drivesTable.name, startTime: drivesTable.startTime, endTime: drivesTable.endTime })
      .from(drivesTable)
      .where(eq(drivesTable.eventId, invitation.eventId));

    const [license] = await db
      .select({ id: huntingLicensesTable.id })
      .from(huntingLicensesTable)
      .where(and(
        eq(huntingLicensesTable.userId, invitation.userId),
        eq(huntingLicensesTable.estateId, invitation.estateId),
      ))
      .limit(1);

    const [validCheckedLicense] = await db
      .select({ id: huntingLicensesTable.id })
      .from(huntingLicensesTable)
      .where(and(
        eq(huntingLicensesTable.userId, invitation.userId),
        eq(huntingLicensesTable.estateId, invitation.estateId),
        eq(huntingLicensesTable.checked, true),
        gt(huntingLicensesTable.expiryDate, invitation.eventDate),
      ))
      .limit(1);

    const [cert] = await db
      .select({ id: trainingCertificatesTable.id })
      .from(trainingCertificatesTable)
      .where(and(
        eq(trainingCertificatesTable.userId, invitation.userId),
        eq(trainingCertificatesTable.estateId, invitation.estateId),
      ))
      .limit(1);

    const [contact] = await db
      .select({ phone: contactsTable.phone, dateOfBirth: contactsTable.dateOfBirth })
      .from(contactsTable)
      .where(eq(contactsTable.userId, invitation.userId))
      .limit(1);

    const hasLicense = !!license;
    const hasCert = !!cert;
    const hasValidCheckedLicense = !!validCheckedLicense;

    res.locals.layout = 'rsvp/layout';

    const common = { invitation, drives, hasLicense, hasCert, hasValidCheckedLicense, contact: contact ?? null };

    if (invitation.response === 'no') {
      return res.render('rsvp/declined', { title: invitation.eventName, ...common });
    }

    if (invitation.response === 'open') {
      return res.render('rsvp/respond', { title: invitation.eventName, ...common });
    }

    // response === 'yes'
    // No explicit step → go to confirmed (if has license) or start wizard at step 1
    // Explicit step → always show the wizard at that step
    const stepParam = Number(req.query.step) || 0;

    if (hasLicense && stepParam === 0) {
      return res.render('rsvp/confirmed', { title: invitation.eventName, ...common });
    }

    const step = Math.min(3, Math.max(1, stepParam || 1));
    return res.render('rsvp/upload', { title: invitation.eventName, step, ...common });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postRespond(req: Request, res: Response) {
  try {
    const invitation = await findInvitation(req.params.publicId);
    if (!invitation) return res.status(404).send('Invitation not found');

    const parsed = z.object({ answer: z.enum(['yes', 'no']) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).send('Invalid answer');

    const { answer } = parsed.data;

    // Allow open→yes/no and yes→no; no is final
    if (invitation.response === 'no') return res.redirect(`/rsvp/${invitation.publicId}`);
    if (invitation.response === 'yes' && answer === 'yes') return res.redirect(`/rsvp/${invitation.publicId}`);

    await db
      .update(invitationsTable)
      .set({ response: answer, respondedAt: new Date() })
      .where(eq(invitationsTable.id, invitation.id));

    res.redirect(`/rsvp/${invitation.publicId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postUploadLicense(req: Request, res: Response) {
  try {
    const invitation = await findInvitation(req.params.publicId);
    if (!invitation) return res.status(404).send('Invitation not found');
    if (invitation.response !== 'yes') return res.status(403).send('Forbidden');

    const files = ((req.files as Record<string, Express.Multer.File[]>) ?? {}).licenseFiles ?? [];

    if (files.length > 0) {
      const result = licenseSchema.safeParse(req.body);
      if (!result.success) return res.status(400).send(result.error.issues[0].message);

      const fileError = validateFiles(files, 4);
      if (fileError) return res.status(400).send(fileError);

      await db.transaction(async (tx) => {
        const [license] = await tx
          .insert(huntingLicensesTable)
          .values({ userId: invitation.userId, estateId: invitation.estateId, expiryDate: result.data.expiryDate })
          .returning();

        for (const file of files) {
          const key = `licenses/hunting/${license.id}/${safeFilename(file.originalname)}`;
          await uploadFile(key, file.buffer, file.mimetype);
          await tx.insert(huntingLicenseAttachmentsTable).values({
            licenseId: license.id,
            kind: file.mimetype === ALLOWED_PDF_TYPE ? 'document' : 'photo',
            key,
            contentType: file.mimetype,
            originalName: file.originalname,
            sizeBytes: file.size,
          });
        }
      });
    }

    res.redirect(`/rsvp/${invitation.publicId}?step=2`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postUploadCertificate(req: Request, res: Response) {
  try {
    const invitation = await findInvitation(req.params.publicId);
    if (!invitation) return res.status(404).send('Invitation not found');
    if (invitation.response !== 'yes') return res.status(403).send('Forbidden');

    const files = ((req.files as Record<string, Express.Multer.File[]>) ?? {}).certFiles ?? [];

    if (files.length > 0) {
      const result = certSchema.safeParse(req.body);
      if (!result.success) return res.status(400).send(result.error.issues[0].message);

      const fileError = validateFiles(files, 2);
      if (fileError) return res.status(400).send(fileError);

      await db.transaction(async (tx) => {
        const [certificate] = await tx
          .insert(trainingCertificatesTable)
          .values({ userId: invitation.userId, estateId: invitation.estateId, issueDate: result.data.issueDate })
          .returning();

        for (const file of files) {
          const key = `certificates/${certificate.id}/${safeFilename(file.originalname)}`;
          await uploadFile(key, file.buffer, file.mimetype);
          await tx.insert(trainingCertificateAttachmentsTable).values({
            certId: certificate.id,
            kind: file.mimetype === ALLOWED_PDF_TYPE ? 'document' : 'photo',
            key,
            contentType: file.mimetype,
            originalName: file.originalname,
            sizeBytes: file.size,
          });
        }
      });
    }

    res.redirect(`/rsvp/${invitation.publicId}?step=3`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}

export async function postUploadDetails(req: Request, res: Response) {
  try {
    const invitation = await findInvitation(req.params.publicId);
    if (!invitation) return res.status(404).send('Invitation not found');
    if (invitation.response !== 'yes') return res.status(403).send('Forbidden');

    const parsed = detailsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.issues[0].message);

    const updates: Record<string, unknown> = {};
    if (parsed.data.dateOfBirth?.trim()) updates.dateOfBirth = parsed.data.dateOfBirth.trim();
    if (parsed.data.phone?.trim()) updates.phone = parsed.data.phone.trim();

    if (Object.keys(updates).length > 0) {
      await db
        .update(contactsTable)
        .set(updates)
        .where(eq(contactsTable.userId, invitation.userId));
    }

    res.redirect(`/rsvp/${invitation.publicId}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
}
