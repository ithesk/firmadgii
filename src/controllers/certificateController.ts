import { Request, Response } from 'express';
import certificateService from '../services/certificateService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

export const getCertificateInfo = asyncHandler(async (req: Request, res: Response) => {
  const { rnc } = req.query;

  const info = certificateService.getCertificateInfo(rnc as string);

  const response: ApiResponse = {
    success: true,
    data: info,
  };

  res.json(response);
});
