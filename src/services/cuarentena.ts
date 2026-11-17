/**
 * Cuarentena de la recepción pública: nada de lo que un emisor nos manda se pierde.
 *
 * Todo lo que llega a las rutas públicas /fe/… y no termina en la bandeja de una empresa se guarda aquí tal
 * cual llegó (método, ruta, cabeceras útiles, cuerpo): rutas mal armadas, RNC que no está dado de alta, XML que
 * no se pudo leer o firmar, fallos al escribir en la bandeja. Después se revisa con GET /api/admin/cuarentena
 * y, si era una factura buena, se reenvía a la ruta correcta.
 *
 * Vive dentro del montaje de la bandeja (`_cuarentena/`), que ya está en el respaldo diario.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import logger from '../utils/logger';

const RAIZ = path.join(process.env.BANDEJA_PATH || path.join(process.cwd(), 'data', 'bandeja'), '_cuarentena');
const ID_VALIDO = /^[0-9]{14}-[0-9a-f]{8}$/;
const MAX_CUERPO = 10 * 1024 * 1024;
// Solo las cabeceras que ayudan a saber quién era; nunca se guardan tokens
const CABECERAS = ['content-type', 'content-length', 'user-agent', 'x-forwarded-for', 'x-real-ip', 'host'];

export interface Retenido {
  id: string;
  recibido: string;
  motivo: string;
  metodo: string;
  ruta: string;
  rutaOriginal?: string;
  ip?: string;
  cabeceras: Record<string, string>;
  cuerpo: string;              // texto tal como llegó (o base64 si era binario)
  cuerpoBase64?: boolean;
  pistas: Record<string, string>; // eNCF, RNC emisor y comprador si se pudieron leer
}

function pista(texto: string, etiqueta: string): string | undefined {
  const m = texto.match(new RegExp(`<${etiqueta}>\\s*([^<]{1,60}?)\\s*</${etiqueta}>`));
  return m ? m[1] : undefined;
}

function textoDelCuerpo(body: unknown): { cuerpo: string; base64?: boolean } {
  if (body === undefined || body === null) return { cuerpo: '' };
  if (Buffer.isBuffer(body)) {
    const b = body.subarray(0, MAX_CUERPO);
    const texto = b.toString('utf8');
    // Si no es texto válido, se guarda en base64 para no estropearlo
    return texto.includes('�') ? { cuerpo: b.toString('base64'), base64: true } : { cuerpo: texto };
  }
  if (typeof body === 'string') return { cuerpo: body.slice(0, MAX_CUERPO) };
  if (typeof body === 'object' && Object.keys(body as object).length === 0) return { cuerpo: '' };
  return { cuerpo: JSON.stringify(body).slice(0, MAX_CUERPO) };
}

export const cuarentena = {
  /** Guarda la petición. Nunca lanza: la cuarentena no puede tumbar la respuesta al emisor. */
  guardar(req: Request, motivo: string, cuerpo?: unknown): string | undefined {
    try {
      fs.mkdirSync(RAIZ, { recursive: true });
      const id = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`;
      const { cuerpo: texto, base64 } = textoDelCuerpo(cuerpo !== undefined ? cuerpo : req.body);
      const cabeceras: Record<string, string> = {};
      for (const c of CABECERAS) {
        const v = req.headers[c];
        if (v) cabeceras[c] = Array.isArray(v) ? v.join(', ') : String(v);
      }
      const pistas: Record<string, string> = {};
      if (!base64) {
        for (const [clave, etiqueta] of [['eNCF', 'eNCF'], ['rncEmisor', 'RNCEmisor'], ['rncComprador', 'RNCComprador'],
          ['montoTotal', 'MontoTotal'], ['fechaEmision', 'FechaEmision']]) {
          const v = pista(texto, etiqueta);
          if (v) pistas[clave] = v;
        }
      }
      const registro: Retenido = {
        id, recibido: new Date().toISOString(), motivo, metodo: req.method, ruta: req.originalUrl,
        rutaOriginal: (req as any).rutaOriginal, ip: req.ip, cabeceras, cuerpo: texto, cuerpoBase64: base64, pistas,
      };
      const destino = path.join(RAIZ, `${id}.json`);
      fs.writeFileSync(`${destino}.tmp`, JSON.stringify(registro), { mode: 0o600 });
      fs.renameSync(`${destino}.tmp`, destino);
      logger.warn(`Cuarentena ${id}: ${motivo} (${req.method} ${req.originalUrl}${pistas.eNCF ? ', ' + pistas.eNCF : ''})`);
      return id;
    } catch (err: any) {
      logger.error(`No se pudo guardar en cuarentena (${motivo}): ${err.message}`);
      return undefined;
    }
  },

  /** Guarda un documento que ya se aceptó pero no se pudo dejar en la bandeja (sin petición a mano). */
  guardarDocumento(motivo: string, xml: string, extra: Record<string, unknown> = {}): string | undefined {
    const falsa = { method: 'POST', originalUrl: '(interno)', headers: {}, body: xml, ip: undefined } as unknown as Request;
    return cuarentena.guardar(falsa, `${motivo} ${JSON.stringify(extra)}`, xml);
  },

  /** Lista lo retenido, lo más nuevo primero, sin el cuerpo (para el panel). */
  listar(limite = 100): Omit<Retenido, 'cuerpo'>[] {
    if (!fs.existsSync(RAIZ)) return [];
    return fs.readdirSync(RAIZ).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, limite)
      .map((f) => {
        try {
          const { cuerpo, ...resto } = JSON.parse(fs.readFileSync(path.join(RAIZ, f), 'utf8')) as Retenido;
          return { ...resto, tamano: cuerpo.length } as any;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  },

  leer(id: string): Retenido | undefined {
    if (!ID_VALIDO.test(id)) return undefined;
    const archivo = path.join(RAIZ, `${id}.json`);
    return fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf8')) : undefined;
  },

  total(): number {
    return fs.existsSync(RAIZ) ? fs.readdirSync(RAIZ).filter((f) => f.endsWith('.json')).length : 0;
  },
};
