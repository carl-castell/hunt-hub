import { Router } from 'express';
import multer from 'multer';
import { verifyCsrfTokenMultipart } from '../middlewares/csrf';
import { requireManager } from '../middlewares/requireRole';
import { getRsvp, postRespond, postUploadLicense, postUploadCertificate, postUploadDetails } from '../controllers/rsvp';
import { getPreviewRsvp, postPreviewRespond, postPreviewUploadLicense, postPreviewUploadCertificate, postPreviewUploadDetails } from '../controllers/rsvp-preview';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10_000_000 } });

const rsvpRouter = Router();

rsvpRouter.use('/preview', requireManager);
rsvpRouter.get('/preview/:eventId', getPreviewRsvp);
rsvpRouter.post('/preview/:eventId/respond', postPreviewRespond);
rsvpRouter.post('/preview/:eventId/upload/license',
  upload.fields([{ name: 'licenseFiles', maxCount: 4 }]),
  verifyCsrfTokenMultipart,
  postPreviewUploadLicense,
);
rsvpRouter.post('/preview/:eventId/upload/certificate',
  upload.fields([{ name: 'certFiles', maxCount: 2 }]),
  verifyCsrfTokenMultipart,
  postPreviewUploadCertificate,
);
rsvpRouter.post('/preview/:eventId/upload/details', postPreviewUploadDetails);

rsvpRouter.get('/:publicId', getRsvp);
rsvpRouter.post('/:publicId/respond', postRespond);
rsvpRouter.post(
  '/:publicId/upload/license',
  upload.fields([{ name: 'licenseFiles', maxCount: 4 }]),
  verifyCsrfTokenMultipart,
  postUploadLicense,
);
rsvpRouter.post(
  '/:publicId/upload/certificate',
  upload.fields([{ name: 'certFiles', maxCount: 2 }]),
  verifyCsrfTokenMultipart,
  postUploadCertificate,
);
rsvpRouter.post('/:publicId/upload/details', postUploadDetails);

export default rsvpRouter;
