import { Request, Response, NextFunction } from 'express';

export const logger = (request: Request, response: Response, next: NextFunction) => {
  console.log(
    new Date().toUTCString(),
    'Request from',
    request.ip,
    request.method,
    request.originalUrl
  );
  next();
};