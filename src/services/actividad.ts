/**
 * Registro de actividad por empresa: qué se envió a la DGII, qué respondió, qué se recibió y qué falló.
 *
 * El servicio no tiene base de datos. Cada hecho es una línea JSON en
 *   <ACTIVIDAD_PATH>/<RNC>/<aaaa-mm>.jsonl
 * Sirve para el panel (qué hace cada empresa, últimos errores) y para contar documentos por mes.
 * Nunca guarda el XML ni claves: solo el número de comprobante, el resultado y el mensaje de error.
 */
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

const RAIZ = process.env.ACTIVIDAD_PATH || path.join(process.cwd(), 'data', 'actividad');
const RNC_VALIDO = /^\d{9,11}$/;
const ESTADOS_FINALES = /^(aceptado|rechazado|aceptado condicional)$/i;

export interface Hecho {
  t: string;              // fecha ISO
  op: string;             // envio, estado, anulacion, aprobacion, entrega, acuse, directorio, recibido, firma…
  ok: boolean;
  ms?: number;
  encf?: string;
  trackId?: string;
  estado?: string;        // respuesta de la DGII: Aceptado, Rechazado, En Proceso…
  ambiente?: string;
  error?: string;
}

// Rutas de /api/invoice que cuentan como actividad, y con qué nombre
const OPERACIONES: Array<[RegExp, string]> = [
  [/^\/send(-signed|-summary|-summary-with-ecf)?$/, 'envio'],
  [/^\/status\//, 'estado'],
  [/^\/void$/, 'anulacion'],
  [/^\/(approval|acecf|acecf\/from-ecf)$/, 'aprobacion'],
  [/^\/deliver$/, 'entrega'],
  [/^\/receipt$/, 'acuse'],
  [/^\/customer-directory\//, 'directorio'],
  [/^\/(prepare|sign|sign-file)$/, 'firma'],
  [/^\/(tracks\/|inquire$)/, 'consulta'],
];

// Estados finales ya anotados (Odoo consulta el mismo trackId muchas veces): evita líneas repetidas
const vistos = new Set<string>();

const archivo = (rnc: string, mes: string): string => path.join(RAIZ, rnc, `${mes}.jsonl`);
const mesDe = (fecha: Date): string => fecha.toISOString().slice(0, 7);

export const actividad = {
  registrar(rnc: string | undefined, hecho: Omit<Hecho, 't'>): void {
    if (!rnc || !RNC_VALIDO.test(rnc)) return;
    try {
      const ahora = new Date();
      const linea: Hecho = { t: ahora.toISOString(), ...hecho };
      if (linea.error) linea.error = String(linea.error).slice(0, 500);
      const destino = archivo(rnc, mesDe(ahora));
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.appendFileSync(destino, JSON.stringify(linea) + '\n', { mode: 0o600 });
    } catch (error: any) {
      // El registro nunca debe impedir facturar
      logger.error(`No se pudo anotar la actividad de ${rnc}: ${error.message}`);
    }
  },

  leer(rnc: string, mes: string = mesDe(new Date())): Hecho[] {
    if (!RNC_VALIDO.test(rnc) || !/^\d{4}-\d{2}$/.test(mes)) return [];
    let texto = '';
    try {
      texto = fs.readFileSync(archivo(rnc, mes), 'utf-8');
    } catch {
      return [];
    }
    const hechos: Hecho[] = [];
    for (const linea of texto.split('\n')) {
      if (!linea) continue;
      try {
        hechos.push(JSON.parse(linea));
      } catch { /* línea cortada: se ignora */ }
    }
    return hechos;
  },

  /** Cuentas del mes y de hoy para el panel. Los comprobantes se cuentan una vez, con su último estado. */
  resumen(rnc: string, mes?: string) {
    const hechos = this.leer(rnc, mes);
    const hoy = new Date().toISOString().slice(0, 10);
    const contar = (lista: Hecho[]) => {
      const enviados = new Set<string>();
      const estados = new Map<string, string>();
      let fallos = 0;
      let recibidos = 0;
      for (const h of lista) {
        if (h.op === 'envio' && h.ok && h.encf) enviados.add(h.encf);
        if (h.op === 'estado' && h.estado && ESTADOS_FINALES.test(h.estado)) estados.set(h.encf || h.trackId || '', h.estado.toLowerCase());
        if (h.op === 'recibido') recibidos += 1;
        if (!h.ok) fallos += 1;
      }
      const de = (estado: string) => [...estados.values()].filter((e) => e === estado).length;
      return {
        enviados: enviados.size,
        aceptados: de('aceptado'),
        condicionales: de('aceptado condicional'),
        rechazados: de('rechazado'),
        recibidos,
        fallos,
      };
    };
    const errores = hechos.filter((h) => !h.ok).slice(-15).reverse();
    const ultimo = hechos.length ? hechos[hechos.length - 1].t : null;
    return { mes: contar(hechos), hoy: contar(hechos.filter((h) => h.t.startsWith(hoy))), ultimaActividad: ultimo, errores };
  },
};

/**
 * Anota cada llamada de una empresa a /api/invoice/*: operación, comprobante, resultado y duración.
 * Se monta delante de las rutas; lee la respuesta sin cambiarla.
 */
export const anotarActividad = (req: Request, res: Response, next: NextFunction): void => {
  const operacion = (OPERACIONES.find(([patron]) => patron.test(req.path)) || [])[1];
  if (!operacion) return next();
  const inicio = Date.now();
  let cuerpo: any;
  const json = res.json.bind(res);
  res.json = (dato: any) => {
    cuerpo = dato;
    return json(dato);
  };
  res.on('finish', () => {
    try {
      const pedido: any = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {};
      const rnc = req.empresa?.rnc || pedido.rnc || pedido.rncEmisor || (req.query as any).rnc;
      const datos: any = cuerpo?.data || {};
      const ok = res.statusCode < 400 && cuerpo?.success !== false;
      const trackId = datos.trackId || (operacion === 'estado' ? req.path.split('/').pop() : undefined);
      const estado = typeof datos.estado === 'string' ? datos.estado : undefined;
      // Solo deja rastro lo que importa: lo que va a la DGII y todo lo que falla
      if (ok && (operacion === 'firma' || operacion === 'consulta' || operacion === 'directorio')) return;
      if (ok && operacion === 'estado') {
        if (!estado || !ESTADOS_FINALES.test(estado)) return;
        const clave = `${rnc}|${trackId}|${estado}`;
        if (vistos.has(clave)) return;
        if (vistos.size > 5000) vistos.clear();
        vistos.add(clave);
      }
      actividad.registrar(rnc, {
        op: operacion,
        ok,
        ms: Date.now() - inicio,
        encf: pedido.encf || pedido.eNCF || datos.encf || undefined,
        trackId,
        estado,
        ambiente: pedido.environment || (req.query as any).environment,
        error: ok ? undefined : String(cuerpo?.error || `HTTP ${res.statusCode}`),
      });
    } catch (error: any) {
      logger.error(`Actividad: ${error.message}`);
    }
  });
  next();
};
