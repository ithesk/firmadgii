import { Request, Response, NextFunction } from 'express';
import config from '../config/environment';
import { AppError } from './errorHandler';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== config.apiKey) {
    throw new AppError('Unauthorized - Invalid API Key', 401);
  }

  next();
};
