import express from 'express';
import { getActivate, postActivate } from '../controllers/users/activate';
import { activationLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

router.get('/:token', activationLimiter, getActivate);
router.post('/:token', activationLimiter, postActivate);

export default router;
