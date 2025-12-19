import { Request, Response } from 'express';
import dgiiService from '../services/dgiiService';
import { ApiResponse, SendInvoiceRequest, SignXmlRequest, InquiryRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';

export const signXml = asyncHandler(async (req: Request, res: Response) => {
  const { xmlData, documentType } = req.body as SignXmlRequest;

  const result = await dgiiService.signXml(xmlData, documentType);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const sendInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { invoiceData, rnc, encf, environment } = req.body as SendInvoiceRequest;

  const result = await dgiiService.sendInvoice(invoiceData, rnc, encf, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const { trackId } = req.params;

  const result = await dgiiService.getStatus(trackId);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const getTracks = asyncHandler(async (req: Request, res: Response) => {
  const { rnc, encf } = req.params;

  const result = await dgiiService.getTracks(rnc, encf);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const inquire = asyncHandler(async (req: Request, res: Response) => {
  const { rncEmisor, encf, rncComprador, securityCode } = req.body as InquiryRequest;

  const result = await dgiiService.inquiryStatus(rncEmisor, encf, rncComprador, securityCode);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const sendSummary = asyncHandler(async (req: Request, res: Response) => {
  const { invoiceData, rnc, encf, environment } = req.body;

  const result = await dgiiService.sendSummary(invoiceData, rnc, encf, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const sendApproval = asyncHandler(async (req: Request, res: Response) => {
  const { approvalData, fileName, rnc, environment } = req.body;

  const result = await dgiiService.sendApproval(approvalData, fileName, rnc, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const voidSequence = asyncHandler(async (req: Request, res: Response) => {
  const { voidData, fileName, rnc, environment } = req.body;

  const result = await dgiiService.voidSequence(voidData, fileName, rnc, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const getCustomerDirectory = asyncHandler(async (req: Request, res: Response) => {
  const { rnc } = req.params;
  const { environment } = req.query as { environment?: string };

  const result = await dgiiService.getCustomerDirectory(rnc, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const generateQR = asyncHandler(async (req: Request, res: Response) => {
  const { rncEmisor, rncComprador, encf, montoTotal, securityCode, fechaEmision, fechaFirma, environment } = req.query as any;

  const qrCodeUrl = dgiiService.generateQRCode({
    rncEmisor,
    rncComprador,
    encf,
    montoTotal: parseFloat(montoTotal),
    securityCode,
    fechaEmision,
    fechaFirma,
    environment,
  });

  const response: ApiResponse = {
    success: true,
    data: { qrCodeUrl },
  };

  res.json(response);
});
