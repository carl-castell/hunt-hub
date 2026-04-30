import express, { Router } from 'express';
import { getDashboard } from '../controllers/manager/dashboard';
import { getEstate, postRenameEstate } from '../controllers/manager/estate';
import { getArea, postCreateArea, postRenameArea, postDeleteArea, postUploadGeofile, postDeleteGeofile } from '../controllers/manager/areas';
import { getGuests, getNewGuest, postCreateGuest, getGuest, postUpdateGuest, postDeleteGuest, postGuestAddToGroup, postGuestRemoveFromGroup } from '../controllers/manager/guests';
import { getEvents, getEvent, postCreateEvent, postUpdateEvent, postDeleteEvent } from '../controllers/manager/events';
import { getInvitation, getInvitationList, getInvitationPicker, postStageInvitations, postRemoveInvitation, postUpdateInvitation, getSendInvitations, postSendInvitations, getPreviewInvitation } from '../controllers/manager/invitations';
import { postCreateDrive, getDrive } from '../controllers/manager/drives';
import {
  getPeople, postCreateUser,
  getUser, postUpdateUserRole, postDeleteUser, postDeactivateUser, postResendActivation, postReactivateUser,
} from '../controllers/manager/people';
import { getAccount, postChangePassword } from '../controllers/manager/account';
import { getGroups, postCreateGroup, getGroup, postRenameGroup, postDeleteGroup, postAddMember, postRemoveMember } from '../controllers/manager/guest_groups';
import {
  getHuntingLicense, postCreateHuntingLicense, postCheckHuntingLicense, postDeleteHuntingLicense, postUpdateHuntingLicense,
  getTrainingCertificate, postCreateTrainingCertificate, postCheckTrainingCertificate, postDeleteTrainingCertificate, postUpdateTrainingCertificate,
} from '@/controllers/licenses';
import { getFile } from '@/controllers/files';
import { verifyCsrfTokenMultipart } from '@/middlewares/csrf';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20_000_000 } });

const managerRouter: Router = express.Router();

// Dashboard
managerRouter.get('/',                                getDashboard);

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
managerRouter.get('/guests/:id/hunting-license',          getHuntingLicense);
managerRouter.post('/guests/:id/hunting-license',         upload.array('files', 4), verifyCsrfTokenMultipart, postCreateHuntingLicense);
managerRouter.post('/guests/:id/hunting-license/check',   postCheckHuntingLicense);
managerRouter.post('/guests/:id/hunting-license/delete',  postDeleteHuntingLicense);
managerRouter.post('/guests/:id/hunting-license/update',  postUpdateHuntingLicense);

// Training Certificate
managerRouter.get('/guests/:id/training-certificate',          getTrainingCertificate);
managerRouter.post('/guests/:id/training-certificate',         upload.array('files', 2), verifyCsrfTokenMultipart, postCreateTrainingCertificate);
managerRouter.post('/guests/:id/training-certificate/check',   postCheckTrainingCertificate);
managerRouter.post('/guests/:id/training-certificate/delete',  postDeleteTrainingCertificate);
managerRouter.post('/guests/:id/training-certificate/update',  postUpdateTrainingCertificate);


// Files
managerRouter.get('/files/*', getFile);


// Events
managerRouter.get('/events',                          getEvents);
managerRouter.get('/events/:id',                      getEvent);
managerRouter.post('/events',                         postCreateEvent);
managerRouter.post('/events/:id/update',              postUpdateEvent);
managerRouter.post('/events/:id/delete',              postDeleteEvent);

// Invitations
managerRouter.get('/events/:eventId/invitations',                         getInvitationList);
managerRouter.get('/events/:eventId/invitations/send',                    getSendInvitations);
managerRouter.get('/events/:eventId/invitations/preview',                 getPreviewInvitation);
managerRouter.post('/events/:eventId/invitations/send',                   postSendInvitations);
managerRouter.get('/events/:eventId/invitations/new',                     getInvitationPicker);
managerRouter.post('/events/:eventId/invitations',                        postStageInvitations);
managerRouter.get('/events/:eventId/invitations/:invitationId',           getInvitation);
managerRouter.post('/events/:eventId/invitations/:invitationId/update',   postUpdateInvitation);
managerRouter.post('/events/:eventId/invitations/:invitationId/remove',   postRemoveInvitation);

// Drives
managerRouter.post('/events/:eventId/drives',         postCreateDrive);
managerRouter.get('/events/:eventId/drives/:id',      getDrive);

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

export default managerRouter;
