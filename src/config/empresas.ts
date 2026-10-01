/**
 * Empresas (multiempresa): cada una con su RNC, su certificado, su clave de API y el Odoo al que avisar.
 *
 * Archivo JSON (EMPRESAS_PATH, por defecto ./config/empresas.json), por ejemplo:
 * [
 *   {
 *     "rnc": "133524996",
 *     "nombre": "INTELIGENCIA TECNOLOGICA HESK SRL",
 *     "apiKeySha256": "<sha256 de la clave de API que usará su Odoo>",
 *     "certificado": "/app/certificates/133524996.p12",          // opcional: por defecto certificates/<RNC>.p12
 *     "claveCertificadoArchivo": "/run/secrets/133524996.clave",  // o "claveCertificado" (o CERTIFICATE_PASSWORD_<RNC>)
 *     "ambiente": "cert",                                         // opcional: ambiente por defecto de esta empresa
 *     "odooWebhookUrl": "https://odoo.empresa.com/ecf_do/recepcion",
 *     "odooWebhookApiKey": "..."
 *   }
 * ]
 * Sin archivo, el servicio funciona como antes: una sola clave (API_KEY) para cualquier RNC.
 * El archivo se vuelve a leer solo cuando cambia (no hace falta reiniciar para dar de alta una empresa).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

export interface Empresa {
  rnc: string;
  nombre?: string;
  apiKeySha256: string;
  certificado?: string;
  claveCertificado?: string;
  claveCertificadoArchivo?: string;
  ambiente?: 'test' | 'cert' | 'prod';
  odooWebhookUrl?: string;
  odooWebhookApiKey?: string;
  activa?: boolean;
}

const RUTA = process.env.EMPRESAS_PATH || path.join(__dirname, '../../config/empresas.json');
let cache: { mtime: number; empresas: Empresa[] } = { mtime: -1, empresas: [] };

export const sha256 = (texto: string): string => crypto.createHash('sha256').update(texto).digest('hex');

const cargar = (): Empresa[] => {
  let mtime = 0;
  try {
    mtime = fs.statSync(RUTA).mtimeMs;
  } catch {
    cache = { mtime: 0, empresas: [] };
    return cache.empresas;
  }
  if (mtime !== cache.mtime) {
    try {
      const lista: Empresa[] = JSON.parse(fs.readFileSync(RUTA, 'utf-8'));
      cache = { mtime, empresas: lista.filter((e) => e && e.rnc && e.activa !== false) };
      logger.info(`Empresas cargadas: ${cache.empresas.length}`);
    } catch (error: any) {
      // Un archivo mal escrito no debe dejar el servicio abierto: se mantiene la última versión buena
      logger.error(`No se pudo leer ${RUTA}: ${error.message}`);
    }
  }
  return cache.empresas;
};

export const empresas = {
  /** Hay archivo de empresas: el acceso es por empresa. */
  multiempresa: (): boolean => cargar().length > 0,
  porRnc: (rnc?: string): Empresa | undefined => (rnc ? cargar().find((e) => e.rnc === rnc) : undefined),
  porApiKey: (clave?: string): Empresa | undefined => {
    if (!clave) return undefined;
    const hash = sha256(clave);
    // Comparación en tiempo constante
    return cargar().find((e) => e.apiKeySha256 && e.apiKeySha256.length === hash.length
      && crypto.timingSafeEqual(Buffer.from(e.apiKeySha256), Buffer.from(hash)));
  },
  claveCertificado: (empresa?: Empresa): string | undefined => {
    if (!empresa) return undefined;
    if (empresa.claveCertificado) return empresa.claveCertificado;
    if (empresa.claveCertificadoArchivo) {
      return fs.readFileSync(empresa.claveCertificadoArchivo, 'utf-8').replace(/\r?\n$/, '');
    }
    return undefined;
  },
};
