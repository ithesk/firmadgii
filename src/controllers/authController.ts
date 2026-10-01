import { Request, Response } from 'express';
import dgiiService from '../services/dgiiService';
import { ApiResponse, AuthRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

export const authenticate = asyncHandler(async (req: Request, res: Response) => {
  const { environment } = req.body as AuthRequest;
  // Con multiempresa el RNC lo pone la autenticación por clave (el de la empresa)
  const { rnc } = req.body as { rnc?: string };

  const tokenData = await dgiiService.authenticate(rnc, environment);

  const response: ApiResponse = {
    success: true,
    data: tokenData,
  };

  res.json(response);
});
