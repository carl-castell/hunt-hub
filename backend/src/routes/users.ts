import express from 'express';
import { requireAuth, requireAdmin, requireUserAccess } from '../middlewares/requireRole';
import { createManager } from '../controllers/users/create';
import { getUser, updateUser, deactivateUser, deleteUser, resendActivation, reactivateUser } from '../controllers/users/users';

const router = express.Router();

router.post('/managers', requireAuth, createManager);
router.get('/:id', requireUserAccess, getUser);
router.post('/:id/update', requireUserAccess, updateUser);
router.post('/:id/deactivate', requireUserAccess, deactivateUser);
router.post('/:id/delete', requireAdmin, deleteUser);
router.post('/:id/resend-activation', requireUserAccess, resendActivation);
router.post('/:id/reactivate', requireUserAccess, reactivateUser);

export default router;
