/**
 * Panel de administración (solo consulta): estado del servicio y de cada empresa.
 * Exige la clave de administración (API_KEY_ADMIN). No da de alta empresas ni toca certificados: eso se hace
 * en el servidor con bin/empresa.js (ver docs/OPERACION.md).
 */
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { empresas } from '../config/empresas';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { intentos } from '../middleware/intentos';
import { actividad } from '../services/actividad';
import { bandeja } from '../services/bandeja';
import certificateService from '../services/certificateService';
import { fila } from '../services/fila';
import { sonda } from '../services/sonda';

const VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')).version;
  } catch {
    return '';
  }
})();

export const soloAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.esAdmin) throw new AppError('Forbidden - se requiere la clave de administración', 403);
  next();
};

/** Vencimiento del certificado de una empresa, sin exponer nada más que fechas y titular. */
const certificado = (rnc: string) => {
  try {
    const info = certificateService.getCertificateInfo(rnc);
    const vence = new Date(info.validTo);
    const titular = (String(info.subject).match(/CN=([^\n]+)/) || [])[1] || '';
    return { vence: vence.toISOString(), dias: Math.floor((vence.getTime() - Date.now()) / 86400000), titular };
  } catch (error: any) {
    return { error: String(error.message).slice(0, 200) };
  }
};

/** Estado general: lo mínimo para saber si se puede facturar (también lo usa /health). */
export const estadoServicio = () => {
  const cola = fila.estado();
  const dgii = sonda.estado();
  const bien = !cola.atascada;
  return {
    status: bien ? 'ok' : 'atascado',
    dgii: dgii.responde ? 'ok' : 'sin respuesta',
    timestamp: new Date().toISOString(),
  };
};

export const resumen = asyncHandler(async (req: Request, res: Response) => {
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : undefined;
  const lista = empresas.todas().map((e) => ({
    rnc: e.rnc,
    nombre: e.nombre || e.rnc,
    ambiente: e.ambiente || '',
    certificado: certificado(e.rnc),
    bandeja: { ...bandeja.pendientes(e.rnc), ultimaRecogida: bandeja.ultimaRecogida(e.rnc) },
    actividad: actividad.resumen(e.rnc, mes),
  }));
  res.json({
    success: true,
    data: {
      servicio: {
        ...estadoServicio(),
        version: VERSION,
        fila: fila.estado(),
        dgii: sonda.estado(),
        memoriaMb: Math.round(process.memoryUsage().rss / 1048576),
        direccionesBloqueadas: intentos.bloqueadas().length,
      },
      mes: mes || new Date().toISOString().slice(0, 7),
      empresas: lista,
    },
  });
});

/** Actividad detallada de una empresa en un mes (para revisar un caso o contar documentos). */
export const actividadEmpresa = asyncHandler(async (req: Request, res: Response) => {
  const rnc = String(req.params.rnc);
  if (!empresas.porRnc(rnc)) throw new AppError('Empresa no encontrada', 404);
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : undefined;
  const hechos = actividad.leer(rnc, mes);
  res.json({ success: true, data: { rnc, hechos: hechos.slice(-500).reverse() } });
});
