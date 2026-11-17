import express, { Router } from 'express';
import { requireWfsAuth } from './requireWfsAuth';
import { wfsGet, wfsTransaction } from './controller';

const wfsRouter: Router = express.Router();

wfsRouter.get('/', requireWfsAuth, wfsGet);

wfsRouter.post(
  '/',
  requireWfsAuth,
  express.text({ type: ['*/xml', 'text/*'], limit: '10mb' }),
  wfsTransaction,
);

export default wfsRouter;
