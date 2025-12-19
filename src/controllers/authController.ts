import { Request, Response } from 'express';
import dgiiService from '../services/dgiiService';
import { ApiResponse, AuthRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

export const authenticate = asyncHandler(async (req: Request, res: Response) => {
  const { environment } = req.body as AuthRequest;

  const tokenData = await dgiiService.authenticate(undefined, environment);

  const response: ApiResponse = {
    success: true,
    data: tokenData,
  };

  res.json(response);
});
