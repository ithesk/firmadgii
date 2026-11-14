/**
 * Sonda de la DGII: cada minuto comprueba, fuera de la fila y sin certificado, que la DGII responde.
 * Permite distinguir «el servicio falla» de «la DGII está caída» en /health y en el panel.
 */
import logger from '../utils/logger';

const URL_SONDA = process.env.DGII_SONDA_URL || 'https://ecf.dgii.gov.do/ecf/autenticacion/api/autenticacion/semilla';
const CADA = 60 * 1000;

let ultimo: { ok: boolean; ms: number; cuando: number; detalle: string } | null = null;
let fallosSeguidos = 0;

const sondear = async (): Promise<void> => {
  const inicio = Date.now();
  try {
    const r = await fetch(URL_SONDA, { signal: AbortSignal.timeout(15000) });
    await r.arrayBuffer();
    ultimo = { ok: r.status < 500, ms: Date.now() - inicio, cuando: Date.now(), detalle: `HTTP ${r.status}` };
  } catch (error: any) {
    ultimo = { ok: false, ms: Date.now() - inicio, cuando: Date.now(), detalle: String(error?.message || error).slice(0, 120) };
  }
  if (ultimo.ok) {
    if (fallosSeguidos >= 3) logger.info('DGII: vuelve a responder');
    fallosSeguidos = 0;
  } else {
    fallosSeguidos += 1;
    if (fallosSeguidos === 3) logger.error(`DGII sin respuesta (3 intentos seguidos): ${ultimo.detalle}`);
  }
};

export const sonda = {
  iniciar(): void {
    sondear();
    setInterval(sondear, CADA).unref();
  },
  /** La DGII responde. Hasta el tercer fallo seguido no se da por caída (evita falsas alarmas). */
  dgiiBien: (): boolean => fallosSeguidos < 3,
  estado: () => (ultimo
    ? { responde: fallosSeguidos < 3, ms: ultimo.ms, detalle: ultimo.detalle, cuando: new Date(ultimo.cuando).toISOString(), fallosSeguidos }
    : { responde: true, ms: 0, detalle: 'sin datos todavía', cuando: null, fallosSeguidos: 0 }),
};
