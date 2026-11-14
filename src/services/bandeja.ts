/**
 * Bandeja de documentos recibidos por empresa (e-CF de proveedores y aprobaciones comerciales).
 *
 * El servicio público recibe de la DGII y de los proveedores, pero el Odoo de la empresa suele estar en su red
 * local, detrás de NAT: no se le puede avisar. Por eso lo recibido se guarda aquí y Odoo lo recoge con su clave
 * (GET /api/inbox) y confirma lo que ya procesó (POST /api/inbox/ack). Nada se borra: lo confirmado pasa a
 * `entregados/`, y lo que Odoo no recoja (Odoo apagado, sin internet) sigue esperando.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { actividad } from './actividad';

const RAIZ = process.env.BANDEJA_PATH || path.join(process.cwd(), 'data', 'bandeja');
const ID_VALIDO = /^[0-9]{14}-[0-9a-f]{8}$/;

export type TipoRecibido = 'ecf' | 'acecf';

export interface Recibido {
  id: string;
  tipo: TipoRecibido;
  recibido: string;            // fecha ISO
  rncReceptor: string;
  xml: string;                 // e-CF o ACECF tal como llegó
  arecfXml?: string;           // acuse que respondimos (solo e-CF)
  arecfEstado?: string;        // 0 recibido, 1 no recibido
  arecfCodigo?: string;        // motivo de no recibido
  info: Record<string, string>;
}

function carpeta(rnc: string, sub = ''): string {
  if (!/^\d{9,11}$/.test(rnc)) throw new Error(`RNC no válido: ${rnc}`);
  const dir = path.join(RAIZ, rnc, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function marcaTiempo(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

// Última vez que el Odoo de cada empresa consultó su bandeja (en memoria: se pierde al reiniciar)
const recogidas = new Map<string, number>();

export const bandeja = {
  guardar(datos: Omit<Recibido, 'id' | 'recibido'>): string {
    const id = `${marcaTiempo()}-${crypto.randomBytes(4).toString('hex')}`;
    const registro: Recibido = { id, recibido: new Date().toISOString(), ...datos };
    const destino = path.join(carpeta(datos.rncReceptor), `${id}.json`);
    // Escritura atómica: Odoo nunca lee un archivo a medias
    fs.writeFileSync(`${destino}.tmp`, JSON.stringify(registro), { mode: 0o600 });
    fs.renameSync(`${destino}.tmp`, destino);
    logger.info(`Bandeja ${datos.rncReceptor}: ${datos.tipo} ${datos.info?.eNCF || ''} guardado (${id})`);
    actividad.registrar(datos.rncReceptor, { op: 'recibido', ok: true, encf: datos.info?.eNCF, estado: datos.tipo });
    return id;
  },

  listar(rnc: string, limite = 50): Recibido[] {
    const dir = carpeta(rnc);
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .slice(0, Math.min(Math.max(limite, 1), 200))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Recibido);
  },

  /** Cuántos documentos esperan a que Odoo los recoja y desde cuándo espera el más antiguo. */
  pendientes(rnc: string): { cantidad: number; masAntiguo: string | null } {
    let nombres: string[] = [];
    try {
      nombres = fs.readdirSync(path.join(RAIZ, rnc)).filter((f) => f.endsWith('.json')).sort();
    } catch { /* sin carpeta: nada recibido */ }
    const m = nombres[0]?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-/);
    return {
      cantidad: nombres.length,
      masAntiguo: m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null,
    };
  },

  /** Odoo pasó a recoger (aunque no hubiera nada): sirve para saber si sigue conectado. */
  anotarRecogida(rnc: string): void {
    if (/^\d{9,11}$/.test(rnc)) recogidas.set(rnc, Date.now());
  },
  ultimaRecogida: (rnc: string): string | null => (recogidas.has(rnc) ? new Date(recogidas.get(rnc)!).toISOString() : null),

  confirmar(rnc: string, ids: string[]): number {
    const dir = carpeta(rnc);
    const entregados = carpeta(rnc, 'entregados');
    let n = 0;
    for (const id of ids || []) {
      if (!ID_VALIDO.test(id)) continue;   // nada de rutas: solo ids generados aquí
      const origen = path.join(dir, `${id}.json`);
      if (fs.existsSync(origen)) {
        fs.renameSync(origen, path.join(entregados, `${id}.json`));
        n += 1;
      }
    }
    return n;
  },
};

/** Saca el XML de un cuerpo multipart (o lo devuelve tal cual si ya es XML). */
export function extraerXml(cuerpo: string, raiz: string): string {
  const m = cuerpo.match(new RegExp(`<\\?xml[\\s\\S]*?</${raiz}>`)) || cuerpo.match(new RegExp(`<${raiz}[\\s>][\\s\\S]*?</${raiz}>`));
  return m ? m[0] : cuerpo;
}
