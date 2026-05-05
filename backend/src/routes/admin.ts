import express from 'express';
import { getDashboard } from '../controllers/admin/dashboard';
import { createEstate, getEstate, renameEstate, deleteEstate } from '../controllers/admin/estates';
import { getAccount, postChangePassword } from '../controllers/admin/account';

const router = express.Router();

router.get('/', getDashboard);
router.get('/account', getAccount);
router.post('/account/password', postChangePassword);
router.post('/estates', createEstate);
router.get('/estates/:id', getEstate);
router.post('/estates/:id/rename', renameEstate);
router.post('/estates/:id/delete', deleteEstate);


export default router;
