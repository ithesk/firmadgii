import { Request, Response, NextFunction } from 'express';
import config from '../config/environment';
import { empresas, Empresa } from '../config/empresas';
import { AppError } from './errorHandler';
import { intentos } from './intentos';
import crypto from 'crypto';

declare module 'express-serve-static-core' {
  interface Request {
    empresa?: Empresa;
    esAdmin?: boolean;
  }
}

// Campos donde las rutas reciben el RNC con cuyo certificado se trabaja
const CAMPOS_RNC = ['rnc', 'rncEmisor', 'certRnc'];

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
const igual = (a: string, b: string): boolean => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/**
 * Autenticación por clave de API.
 * - Con archivo de empresas: cada clave es de una empresa y SOLO puede usar el certificado de su RNC.
 *   Si la petición no indica RNC, se usa el de la empresa. API_KEY_ADMIN (opcional) da acceso a todas.
 * - Sin archivo de empresas: como antes, una sola clave (API_KEY) para cualquier RNC.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!empresas.multiempresa()) {
    if (!apiKey || apiKey !== config.apiKey) {
      throw new AppError('Unauthorized - Invalid API Key', 401);
    }
    return next();
  }

  const ip = req.ip || 'desconocida';
  const admin = process.env.API_KEY_ADMIN;
  // La clave de administración no se evalúa para una dirección que viene fallando (ver middleware/intentos.ts)
  if (admin && apiKey && !intentos.bloqueada(ip) && igual(apiKey, admin)) {
    req.esAdmin = true;
    return next();
  }

  const empresa = empresas.porApiKey(apiKey);
  if (!empresa) {
    if (apiKey) intentos.fallo(ip);
    throw new AppError('Unauthorized - Invalid API Key', intentos.bloqueada(ip) ? 429 : 401);
  }
  req.empresa = empresa;

  // El RNC indicado (cuerpo, consulta o ruta /tracks/:rnc) tiene que ser el de la empresa
  const body: any = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : null;
  const indicados = [
    ...CAMPOS_RNC.map((c) => body?.[c]),
    ...CAMPOS_RNC.map((c) => (req.query as any)[c]),
    (req.path.match(/^\/invoice\/tracks\/([^/]+)\//) || [])[1],
  ].filter(Boolean);
  if (indicados.some((rnc) => String(rnc) !== empresa.rnc)) {
    throw new AppError(`Forbidden - this API key can only use RNC ${empresa.rnc}`, 403);
  }
  // Sin RNC: el de la empresa (nunca el certificado por defecto del servicio)
  if (body && !body.rnc) body.rnc = empresa.rnc;
  if (!(req.query as any).rnc) (req.query as any).rnc = empresa.rnc;
  // Sin ambiente: el de la empresa
  if (empresa.ambiente) {
    if (body && !body.environment) body.environment = empresa.ambiente;
    if (!(req.query as any).environment) (req.query as any).environment = empresa.ambiente;
  }
  next();
};
