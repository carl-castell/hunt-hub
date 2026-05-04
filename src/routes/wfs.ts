import express, { Router } from 'express';
import { requireWfsAuth } from '@/middlewares/requireWfsAuth';
import { wfsGet, wfsTransaction } from '@/controllers/wfs';

const wfsRouter: Router = express.Router();

wfsRouter.get('/', requireWfsAuth, wfsGet);

wfsRouter.post(
  '/',
  requireWfsAuth,
  express.text({ type: ['*/xml', 'text/*'], limit: '10mb' }),
  wfsTransaction,
);

export default wfsRouter;
