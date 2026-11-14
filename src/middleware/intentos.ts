/**
 * Freno a quien prueba claves: tras varios fallos seguidos desde una misma dirección, esa dirección deja de poder
 * usar la clave de administración durante un rato (ni se evalúa). Las claves de empresa se siguen comprobando:
 * son de 256 bits al azar (no se adivinan) y un bloqueo ahí dejaría sin facturar a quien comparte dirección.
 */
import logger from '../utils/logger';

const VENTANA = 15 * 60 * 1000;
const MAXIMO = 8;
const fallos = new Map<string, number[]>();

const recientes = (ip: string): number[] => {
  const desde = Date.now() - VENTANA;
  const lista = (fallos.get(ip) || []).filter((t) => t > desde);
  if (lista.length) fallos.set(ip, lista); else fallos.delete(ip);
  return lista;
};

export const intentos = {
  bloqueada: (ip: string): boolean => recientes(ip).length >= MAXIMO,
  fallo(ip: string): void {
    const lista = recientes(ip);
    lista.push(Date.now());
    fallos.set(ip, lista);
    if (lista.length === MAXIMO) logger.error(`Demasiadas claves erróneas desde ${ip}: administración bloqueada 15 min para esa dirección`);
    if (fallos.size > 5000) fallos.clear();
  },
  bloqueadas: (): string[] => [...fallos.keys()].filter((ip) => recientes(ip).length >= MAXIMO),
};
