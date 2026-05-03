import { Request, Response } from 'express';
import { eq, or } from 'drizzle-orm';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKET } from '@/services/storage';
import { audit } from '@/services/audit';
import { db } from '../db';
import { huntingLicenseAttachmentsTable, huntingLicensesTable, trainingCertificateAttachmentsTable, trainingCertificatesTable } from '../db/schema/licenses';

export async function getFile(req: Request, res: Response) {
  try {
    const user = req.session.user!;
    const key = (req.params as any)[0]; // captures full path after /files/

    // Look up the attachment in hunting licenses
    const [huntingAttachment] = await db
      .select({
        key: huntingLicenseAttachmentsTable.key,
        contentType: huntingLicenseAttachmentsTable.contentType,
        estateId: huntingLicensesTable.estateId,
      })
      .from(huntingLicenseAttachmentsTable)
      .innerJoin(huntingLicensesTable, eq(huntingLicenseAttachmentsTable.licenseId, huntingLicensesTable.id))
      .where(eq(huntingLicenseAttachmentsTable.key, key))
      .limit(1);

    // Look up the attachment in training certificates
    const [certAttachment] = await db
      .select({
        key: trainingCertificateAttachmentsTable.key,
        contentType: trainingCertificateAttachmentsTable.contentType,
        estateId: trainingCertificatesTable.estateId,
      })
      .from(trainingCertificateAttachmentsTable)
      .innerJoin(trainingCertificatesTable, eq(trainingCertificateAttachmentsTable.certId, trainingCertificatesTable.id))
      .where(eq(trainingCertificateAttachmentsTable.key, key))
      .limit(1);

    const attachment = huntingAttachment ?? certAttachment;

    if (!attachment) return res.status(404).send('File not found');

    // Estate check — only allow access to files belonging to the same estate
    if (attachment.estateId !== user.estateId) return res.status(403).send('Forbidden');

    // Fetch from storage and stream back
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const object = await s3.send(command);

    if (!object.Body) return res.status(404).send('File not found');

    res.setHeader('Content-Type', attachment.contentType);
    res.setHeader('Content-Disposition', 'inline');
    if (object.ContentLength) res.setHeader('Content-Length', object.ContentLength);

    await audit({
      event: 'bucket_file_access',
      userId: user.id,
      ip: req.ip,
      metadata: { key },
    });

    (object.Body as NodeJS.ReadableStream).pipe(res);
  } catch (err: any) {
    if (err?.name === 'NoSuchKey') return res.status(404).send('File not found');
    console.error(err);
    res.status(500).send('Server error');
  }
}
