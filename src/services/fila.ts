/**
 * Fila de llamadas a la DGII.
 *
 * dgii-ecf guarda la ficha de la DGII en una cabecera global: con varias empresas, dos llamadas a la vez podrían
 * cruzar fichas. Por eso van de una en una. El riesgo de una sola fila es que una llamada que no termina detenga a
 * todas las empresas; aquí cada tarea tiene un tiempo máximo y la fila sigue aunque una se quede sin respuesta.
 *
 * - LIMITE_TAREA: lo que puede durar una tarea. Menor que la espera de Odoo (60 s) para que reciba un error claro.
 * - LIMITE_ESPERA: lo que una tarea puede esperar su turno. Pasado ese tiempo, quien la pidió ya no está
 *   esperando: no se ejecuta (un envío hecho «a ciegas» sería peor que un error).
 */
import logger from '../utils/logger';

const segundos = (variable: string, porDefecto: number): number => {
  const valor = parseInt(process.env[variable] || '', 10);
  return (Number.isFinite(valor) && valor > 0 ? valor : porDefecto) * 1000;
};

export const LIMITE_PETICION = segundos('DGII_LIMITE_PETICION', 25);   // cada petición HTTP a la DGII
export const LIMITE_TAREA = segundos('DGII_LIMITE_TAREA', 50);         // tarea completa (ficha + llamada + reintento)
export const LIMITE_ESPERA = segundos('DGII_LIMITE_ESPERA', 45);       // espera en la fila antes de empezar

export class ErrorFila extends Error {
  statusCode: number;
  isOperational = true;
  constructor(mensaje: string, statusCode = 504) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

export interface Etiqueta {
  operacion: string;
  rnc?: string;
  ambiente?: string;
}

interface EnCurso extends Etiqueta {
  desde: number;
}

class Fila {
  private cola: Promise<unknown> = Promise.resolve();
  private pendientes = 0;
  private enCurso: EnCurso | null = null;
  private terminadas = 0;
  private fallidas = 0;
  private vencidas = 0;
  private ultimaBien = 0;
  private ultimoError: { cuando: number; mensaje: string; operacion: string; rnc?: string } | null = null;
  private readonly arranque = Date.now();

  ejecutar<T>(tarea: () => Promise<T>, etiqueta: Etiqueta = { operacion: 'dgii' }): Promise<T> {
    const pedida = Date.now();
    this.pendientes += 1;
    const turno = async (): Promise<T> => {
      this.pendientes -= 1;
      const espera = Date.now() - pedida;
      if (espera > LIMITE_ESPERA) {
        this.fallidas += 1;
        this.vencidas += 1;
        this.anotarError(etiqueta, `esperó ${Math.round(espera / 1000)} s en la fila`);
        throw new ErrorFila('timeout: servicio ocupado, la llamada esperó demasiado en la fila y no se envió a la DGII', 503);
      }
      this.enCurso = { ...etiqueta, desde: Date.now() };
      let reloj: NodeJS.Timeout | undefined;
      try {
        const resultado = await Promise.race([
          tarea(),
          new Promise<never>((_, rechazar) => {
            reloj = setTimeout(() => rechazar(new ErrorFila(
              `timeout: la DGII no respondió en ${LIMITE_TAREA / 1000} s (${etiqueta.operacion})`)), LIMITE_TAREA);
          }),
        ]);
        this.terminadas += 1;
        this.ultimaBien = Date.now();
        return resultado;
      } catch (error: any) {
        this.fallidas += 1;
        if (error instanceof ErrorFila || /timeout|ETIMEDOUT|ECONNABORTED/i.test(String(error?.code || '') + String(error?.message || ''))) this.vencidas += 1;
        this.anotarError(etiqueta, String(error?.message || error));
        throw error;
      } finally {
        if (reloj) clearTimeout(reloj);
        this.enCurso = null;
      }
    };
    const resultado = this.cola.then(turno, turno);
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }

  private anotarError(etiqueta: Etiqueta, mensaje: string): void {
    this.ultimoError = { cuando: Date.now(), mensaje: mensaje.slice(0, 300), operacion: etiqueta.operacion, rnc: etiqueta.rnc };
    if (/timeout|fila/i.test(mensaje)) {
      logger.error(`Fila DGII: ${etiqueta.operacion} ${etiqueta.rnc || ''}: ${mensaje}`);
    }
  }

  /** Segundos que lleva la tarea en curso (0 si no hay ninguna). */
  segundosEnCurso(): number {
    return this.enCurso ? Math.round((Date.now() - this.enCurso.desde) / 1000) : 0;
  }

  /** La fila no avanza: una tarea lleva mucho más de su límite (no debería ocurrir; lo vigila el guardián). */
  atascada(): boolean {
    return !!this.enCurso && Date.now() - this.enCurso.desde > LIMITE_TAREA * 2;
  }

  estado() {
    const iso = (ms: number) => (ms ? new Date(ms).toISOString() : null);
    return {
      atascada: this.atascada(),
      pendientes: this.pendientes,
      enCurso: this.enCurso
        ? { operacion: this.enCurso.operacion, rnc: this.enCurso.rnc, segundos: this.segundosEnCurso() }
        : null,
      terminadas: this.terminadas,
      fallidas: this.fallidas,
      sinRespuesta: this.vencidas,
      ultimaBien: iso(this.ultimaBien),
      ultimoError: this.ultimoError ? { ...this.ultimoError, cuando: iso(this.ultimoError.cuando) } : null,
      arranque: iso(this.arranque),
    };
  }
}

export const fila = new Fila();

/**
 * Guardián: si pese a los límites la fila se queda detenida, el proceso termina y Docker lo arranca de nuevo
 * (restart: unless-stopped). Preferible a quedar «encendido» sin poder facturar.
 */
export const vigilarFila = (): void => {
  const reloj = setInterval(() => {
    if (fila.atascada()) {
      logger.error(`Fila DGII detenida ${fila.segundosEnCurso()} s: se reinicia el servicio`, fila.estado());
      setTimeout(() => process.exit(1), 500);
    }
  }, 15000);
  reloj.unref();
};
