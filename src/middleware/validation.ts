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

  signXml: Joi.object({
    xmlData: Joi.string().required(),
    documentType: Joi.string().valid('ECF', 'ACECF', 'ANECF', 'RFCE', 'ARECF').required(),
  }),

  auth: Joi.object({
    environment: Joi.string().valid('test', 'cert', 'prod').optional(),
  }),

  inquiry: Joi.object({
    rncEmisor: Joi.string().required(),
    encf: Joi.string().required(),
    rncComprador: Joi.string().optional(),
    securityCode: Joi.string().optional(),
  }),
};
