import express, { Router } from 'express';
import { getEstate, postRenameEstate } from '../controllers/manager/estate';
import { getArea, postCreateArea, postRenameArea, postDeleteArea, postUploadGeofile, postDeleteGeofile } from '../controllers/manager/areas';
import { getGuests, getNewGuest, postCreateGuest, getGuest, postUpdateGuest, postDeleteGuest, postGuestAddToGroup, postGuestRemoveFromGroup } from '../controllers/manager/guests';
import {
  getPeople, postCreateUser,
  getUser, postUpdateUserRole, postDeleteUser, postDeactivateUser, postResendActivation, postReactivateUser,
} from '../controllers/manager/people';
import { getAccount, postChangePassword, postGenerateWfsToken, postDeleteWfsToken } from '../controllers/manager/account';
import { getGroups, postCreateGroup, getGroup, postRenameGroup, postDeleteGroup, postAddMember, postRemoveMember } from '../controllers/manager/guest_groups';
import {
  postCreateHuntingLicense, postCreateTrainingCertificate,
} from '@/controllers/licenses';
import { getFile } from '@/controllers/files';
import { verifyCsrfTokenMultipart } from '@/middlewares/csrf';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20_000_000 } });

const managerRouter: Router = express.Router();

// Dashboard
// The dashboard lives in the React app (HUN-97); /manager (login, old links) is sent there.
managerRouter.get('/', (_req, res) => res.redirect('/app/manager'));

// Estate
managerRouter.get('/estate',                          getEstate);
managerRouter.post('/estate/rename',                  postRenameEstate);

// Areas
managerRouter.post('/areas',                          postCreateArea);
managerRouter.get('/areas/:id',                       getArea);
managerRouter.post('/areas/:id/rename',               postRenameArea);
managerRouter.post('/areas/:id/delete',               postDeleteArea);
managerRouter.post('/areas/:id/geofile',              upload.single('geofile'), verifyCsrfTokenMultipart, postUploadGeofile);
managerRouter.post('/areas/:id/geofile/delete',       postDeleteGeofile);

// Guests
managerRouter.get('/guests',                          getGuests);
managerRouter.get('/guests/new',                      getNewGuest);
managerRouter.post('/guests',                         postCreateGuest);
managerRouter.get('/guests/:id',                      getGuest);
managerRouter.post('/guests/:id/add-to-group',                    postGuestAddToGroup);
managerRouter.post('/guests/:id/remove-from-group/:groupId',      postGuestRemoveFromGroup);
managerRouter.post('/guests/:id/update',              postUpdateGuest);
managerRouter.post('/guests/:id/delete',              postDeleteGuest);

// Hunting License
// Viewing and checking happen in the React check tool (HUN-95).
managerRouter.get('/guests/:id(\\d+)/hunting-license', (req, res) => res.redirect(`/app/manager/guests/${req.params.id}/documents?kind=licence`));
managerRouter.post('/guests/:id/hunting-license',         upload.array('files', 4), verifyCsrfTokenMultipart, postCreateHuntingLicense);

// Training Certificate
// Viewing and checking happen in the React check tool (HUN-95).
managerRouter.get('/guests/:id(\\d+)/training-certificate', (req, res) => res.redirect(`/app/manager/guests/${req.params.id}/documents?kind=certificate`));
managerRouter.post('/guests/:id/training-certificate',         upload.array('files', 2), verifyCsrfTokenMultipart, postCreateTrainingCertificate);


// Files
managerRouter.get('/files/*', getFile);


// Events
// The events list, the event page and the drive pages live in the React app (HUN-88);
// old links (dashboard, breadcrumbs, bookmarks) are sent there. Creating, changing and
// deleting events and drives goes through the tRPC API (manager.events / manager.drives).
managerRouter.get('/events', (_req, res) => res.redirect('/app/manager/events'));
managerRouter.get('/events/:id(\\d+)', (req, res) => res.redirect(`/app/manager/events/${req.params.id}`));

// Invitations: the guest list is the Guests tab of the React event page (HUN-89).
managerRouter.get('/events/:eventId(\\d+)/invitations*', (req, res) => res.redirect(`/app/manager/events/${req.params.eventId}?tab=guests`));

// Drives
managerRouter.get('/events/:eventId(\\d+)/drives/:id', (req, res) => res.redirect(`/app/manager/events/${req.params.eventId}?tab=drives`));

// People
managerRouter.get('/people',                          getPeople);
managerRouter.post('/people',                         postCreateUser);
managerRouter.get('/people/:id',                      getUser);
managerRouter.post('/people/:id/role',                postUpdateUserRole);
managerRouter.post('/people/:id/delete',              postDeleteUser);
managerRouter.post('/people/:id/deactivate',          postDeactivateUser);
managerRouter.post('/people/:id/reactivate',          postReactivateUser);
managerRouter.post('/people/:id/resend-activation',   postResendActivation);

// Guest Groups
managerRouter.get('/guest-groups',                                  getGroups);
managerRouter.post('/guest-groups',                                 postCreateGroup);
managerRouter.get('/guest-groups/:id',                              getGroup);
managerRouter.post('/guest-groups/:id/rename',                      postRenameGroup);
managerRouter.post('/guest-groups/:id/delete',                      postDeleteGroup);
managerRouter.post('/guest-groups/:id/members',                     postAddMember);
managerRouter.post('/guest-groups/:id/members/:userId/remove',      postRemoveMember);

// Account
managerRouter.get('/account',                         getAccount);
managerRouter.post('/account/password',               postChangePassword);
managerRouter.post('/account/wfs-token/generate',     postGenerateWfsToken);
managerRouter.post('/account/wfs-token/delete',       postDeleteWfsToken);

export default managerRouter;
