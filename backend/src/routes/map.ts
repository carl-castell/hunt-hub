import express, { Router } from 'express';
import { getLayerConfig, getAreaMapData } from '../controllers/map';

const mapRouter: Router = express.Router();

mapRouter.get('/layers',     getLayerConfig);
mapRouter.get('/area/:id',   getAreaMapData);

export default mapRouter;
