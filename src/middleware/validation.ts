import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export const validateRequest = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errorMessage = error.details.map((detail: any) => detail.message).join(', ');
      throw new AppError(`Validation error: ${errorMessage}`, 400);
    }

    next();
  };
};

export const schemas = {
  sendInvoice: Joi.object({
    invoiceData: Joi.object().required(),
    rnc: Joi.string().required(),
    encf: Joi.string().required(),
    environment: Joi.string().valid('test', 'cert', 'prod').optional(),
  }),

  prepareInvoice: Joi.object({
    invoiceData: Joi.object().required(),
    rnc: Joi.string().required(),
    encf: Joi.string().required(),
    environment: Joi.string().valid('test', 'cert', 'prod').optional(),
  }),

  sendSigned: Joi.object({
    signedXml: Joi.string().required(),
    rnc: Joi.string().required(),
    encf: Joi.string().required(),
    tipo: Joi.string().valid('ECF', 'RFCE').required(),
    environment: Joi.string().valid('test', 'cert', 'prod').optional(),
  }),

  signXml: Joi.object({
    xmlData: Joi.string().required(),
    // ECF, RFCE, ACECF, ANECF, ARECF y los documentos de la certificación (Postulacion, declaración jurada…):
    // es el nombre del elemento raíz del XML
    documentType: Joi.string().pattern(/^[A-Za-z][A-Za-z0-9_]{1,40}$/).required(),
    rnc: Joi.string().optional(),
  }),

  auth: Joi.object({
    environment: Joi.string().valid('test', 'cert', 'prod').optional(),
    rnc: Joi.string().optional(),
  }),

  inquiry: Joi.object({
    rncEmisor: Joi.string().required(),
    encf: Joi.string().required(),
    rncComprador: Joi.string().optional(),
    securityCode: Joi.string().optional(),
    // La autenticación multiempresa añade el RNC y el ambiente de la empresa
    rnc: Joi.string().optional(),
    environment: Joi.string().valid('test', 'cert', 'prod').optional(),
  }),
};
