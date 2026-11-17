/**
 * Panel de administración: estado del servicio y de cada empresa, y las acciones para resolver un problema sin
 * entrar al servidor (destrabar la fila, reiniciar, probar una empresa, consultar un documento en la DGII,
 * dar de alta o suspender empresas, cambiar claves y certificados).
 * Todo exige la clave de administración (API_KEY_ADMIN) y cada acción queda anotada en la auditoría.
 * Nunca se devuelve una clave ni un certificado ya guardados; una clave de API nueva se muestra una sola vez.
 */
import crypto, { X509Certificate } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { P12Reader } from 'dgii-ecf';
import config from '../config/environment';
import { empresas, Empresa, sha256 } from '../config/empresas';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { intentos } from '../middleware/intentos';
import { actividad, auditoria, textoMensajes } from '../services/actividad';
import { bandeja } from '../services/bandeja';
import { cuarentena } from '../services/cuarentena';
import certificateService from '../services/certificateService';
import dgiiService from '../services/dgiiService';
import { fila } from '../services/fila';
import logger from '../utils/logger';
import { sonda } from '../services/sonda';

const VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')).version;
  } catch {
    return '';
  }
})();

const RNC_VALIDO = /^\d{9,11}$/;
const AMBIENTES = ['test', 'cert', 'prod'];

/** Empresa de la ruta /:rnc, incluidas las suspendidas. */
const empresaDe = (req: Request): Empresa => {
  const rnc = String(req.params.rnc || '');
  const empresa = RNC_VALIDO.test(rnc) ? empresas.completas().find((e) => e.rnc === rnc) : undefined;
  if (!empresa) throw new AppError('Empresa no encontrada', 404);
  return empresa;
};

const anotar = (req: Request, accion: string, rnc?: string, detalle?: string): void =>
  auditoria.anotar(accion, { rnc, detalle, ip: req.ip });

/** Cambia una empresa en el archivo y lo guarda. */
const modificar = (rnc: string, cambio: (e: Empresa) => void): void => {
  const lista = empresas.completas();
  const empresa = lista.find((e) => e.rnc === rnc);
  if (!empresa) throw new AppError('Empresa no encontrada', 404);
  cambio(empresa);
  empresas.guardar(lista);
};

const claveNueva = (): { clave: string; hash: string } => {
  const clave = crypto.randomBytes(32).toString('base64url');
  return { clave, hash: sha256(clave) };
};

export const soloAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.esAdmin) throw new AppError('Forbidden - se requiere la clave de administración', 403);
  next();
};

/** Vencimiento del certificado de una empresa, sin exponer nada más que fechas y titular. */
const certificado = (rnc: string) => {
  try {
    if (!empresas.porRnc(rnc)) return { error: 'Empresa suspendida' };
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
  const lista = empresas.completas().map((e) => ({
    rnc: e.rnc,
    nombre: e.nombre || e.rnc,
    ambiente: e.ambiente || '',
    activa: e.activa !== false,
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
      acciones: auditoria.ultimas(20),
    },
  });
});

/** Actividad detallada de una empresa en un mes (para revisar un caso o contar documentos). */
export const actividadEmpresa = asyncHandler(async (req: Request, res: Response) => {
  const rnc = String(req.params.rnc);
  empresaDe(req);
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : undefined;
  const hechos = actividad.leer(rnc, mes);
  res.json({ success: true, data: { rnc, hechos: hechos.slice(-500).reverse() } });
});

/* ------------------------------------------------------------------ Acciones sobre el servicio */

/** Descarta lo que espera turno en la fila de la DGII (Odoo lo reintenta solo). */
export const vaciarFila = asyncHandler(async (req: Request, res: Response) => {
  const descartadas = fila.vaciar();
  anotar(req, 'vaciar-fila', undefined, `${descartadas} en espera`);
  res.json({ success: true, data: { descartadas, fila: fila.estado() } });
});

/** Reinicia el proceso: Docker lo arranca de nuevo en unos segundos (restart: unless-stopped). */
export const reiniciar = asyncHandler(async (req: Request, res: Response) => {
  anotar(req, 'reiniciar');
  res.json({ success: true, data: { mensaje: 'El servicio se reinicia; vuelve en unos segundos.' } });
  setTimeout(() => process.exit(0), 400);
});

/* ------------------------------------------------------------------ Diagnóstico de una empresa */

/** Comprueba en vivo, paso a paso, que la empresa puede facturar: certificado y autenticación con la DGII. */
export const probarEmpresa = asyncHandler(async (req: Request, res: Response) => {
  const empresa = empresaDe(req);
  const pasos: Array<{ paso: string; ok: boolean; ms: number; detalle: string }> = [];
  const medir = async (paso: string, tarea: () => Promise<string>): Promise<boolean> => {
    const inicio = Date.now();
    try {
      pasos.push({ paso, ok: true, ms: Date.now() - inicio, detalle: await tarea() });
      pasos[pasos.length - 1].ms = Date.now() - inicio;
      return true;
    } catch (error: any) {
      pasos.push({ paso, ok: false, ms: Date.now() - inicio, detalle: String(error?.message || error).slice(0, 400) });
      return false;
    }
  };
  let seguir = await medir('Empresa activa', async () => {
    if (empresa.activa === false) throw new Error('La empresa está suspendida: su clave no funciona');
    const nombres: Record<string, string> = { prod: 'Producción', cert: 'Certificación', test: 'Pruebas' };
    return `En ${nombres[empresa.ambiente || ''] || 'un ambiente sin definir'}`;
  });
  seguir = seguir && await medir('Certificado', async () => {
    dgiiService.olvidar(empresa.rnc);   // se vuelve a leer del disco: prueba el archivo y la clave actuales
    const info = certificateService.getCertificateInfo(empresa.rnc);
    const dias = Math.floor((new Date(info.validTo).getTime() - Date.now()) / 86400000);
    if (dias < 0) throw new Error(`El certificado venció hace ${-dias} días`);
    return `Abre con su clave; vence en ${dias} días`;
  });
  seguir = seguir && await medir('Autenticación con la DGII', async () => {
    const ficha = await dgiiService.authenticate(empresa.rnc, empresa.ambiente);
    if (!ficha?.token) throw new Error('La DGII no devolvió una ficha');
    return 'La DGII aceptó el certificado';
  });
  await medir('Recepción pública', async () => {
    dgiiService.generateSeed(empresa.rnc);
    return 'Lista para recibir comprobantes de proveedores';
  });
  const ok = pasos.every((p) => p.ok);
  anotar(req, 'probar', empresa.rnc, ok ? 'bien' : `falla: ${pasos.find((p) => !p.ok)?.paso}`);
  res.json({ success: true, data: { ok, pasos } });
});

/* ------------------------------------------------------------------ Documentos */

export const documentosEmpresa = asyncHandler(async (req: Request, res: Response) => {
  const empresa = empresaDe(req);
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : undefined;
  res.json({ success: true, data: { rnc: empresa.rnc, documentos: actividad.documentos(empresa.rnc, mes, String(req.query.buscar || '')) } });
});

/** Pregunta a la DGII por un documento: por trackId (estado) o por número de comprobante (sus envíos). */
export const consultarDocumento = asyncHandler(async (req: Request, res: Response) => {
  const empresa = empresaDe(req);
  if (empresa.activa === false) throw new AppError('La empresa está suspendida', 400);
  const trackId = String(req.body?.trackId || '').trim();
  const encf = String(req.body?.encf || '').trim().toUpperCase();
  if (!trackId && !/^E\d{12}$/.test(encf)) throw new AppError('Indique el trackId o un número de comprobante (E + 12 dígitos)', 400);
  anotar(req, 'consultar', empresa.rnc, trackId || encf);
  let consultas: any[] = [];
  try {
    if (trackId) {
      consultas = [await dgiiService.getStatus(trackId, empresa.rnc, empresa.ambiente)];
    } else {
      const tracks = await dgiiService.getTracks(empresa.rnc, encf, empresa.ambiente);
      consultas = Array.isArray(tracks) ? tracks : [tracks];
    }
  } catch (error: any) {
    // «No encontrado» no es un fallo: la DGII no tiene ese documento (nunca se envió o es de otro ambiente)
    if (!/no encontrad/i.test(String(error?.message || ''))) throw error;
  }
  const resultado = consultas.filter(Boolean).map((c: any) => ({
    trackId: c.trackId || trackId,
    encf: c.encf || encf,
    estado: c.estado || '',
    fechaRecepcion: c.fechaRecepcion || '',
    detalle: textoMensajes(c.mensajes) || '',
  }));
  for (const r of resultado) {
    if (/^(aceptado|rechazado|aceptado condicional)$/i.test(r.estado)) {
      actividad.registrar(empresa.rnc, { op: 'estado', ok: true, encf: r.encf || undefined, trackId: r.trackId || undefined, estado: r.estado, detalle: r.detalle || undefined, ambiente: empresa.ambiente });
    }
  }
  res.json({ success: true, data: { resultado } });
});

/* ------------------------------------------------------------------ Gestión de empresas */

/** Comprueba que el certificado se abre con su clave y no está vencido. Devuelve vencimiento y titular. */
const validarCertificado = (p12Base64: string, clave: string): { vence: string; dias: number; titular: string } => {
  let certs: any;
  try {
    certs = new P12Reader(clave).getKeyFromStringBase64(p12Base64);
  } catch {
    throw new AppError('El certificado no se pudo abrir: archivo dañado o clave incorrecta', 400);
  }
  if (!certs?.cert || !certs?.key) throw new AppError('El archivo no contiene un certificado con su clave privada', 400);
  const x509 = new X509Certificate(certs.cert);
  const vence = new Date(x509.validTo);
  const dias = Math.floor((vence.getTime() - Date.now()) / 86400000);
  if (dias < 0) throw new AppError(`El certificado está vencido desde el ${vence.toISOString().slice(0, 10)}`, 400);
  return { vence: vence.toISOString(), dias, titular: (String(x509.subject).match(/CN=([^\n]+)/) || [])[1] || '' };
};

/** Guarda certificado y clave de una empresa; conserva el certificado anterior junto al nuevo. */
const guardarCertificado = (empresa: Empresa, p12Base64: string, clave: string): void => {
  const destino = empresa.certificado || path.join(path.dirname(config.certificatePath), `${empresa.rnc}.p12`);
  const archivoClave = path.join(empresas.carpeta(), `${empresa.rnc}.clave`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (fs.existsSync(destino)) {
    fs.copyFileSync(destino, `${destino}.anterior`);
    fs.chmodSync(`${destino}.anterior`, 0o600);
  }
  fs.writeFileSync(`${destino}.tmp`, Buffer.from(p12Base64, 'base64'), { mode: 0o600 });
  fs.renameSync(`${destino}.tmp`, destino);
  fs.writeFileSync(`${archivoClave}.tmp`, clave, { mode: 0o600 });
  fs.renameSync(`${archivoClave}.tmp`, archivoClave);
  modificar(empresa.rnc, (e) => {
    e.claveCertificadoArchivo = archivoClave;
    delete e.claveCertificado;
  });
  dgiiService.olvidar(empresa.rnc);
};

const leerCertificado = (body: any): { p12: string; clave: string } | null => {
  const p12 = String(body?.certificadoBase64 || '').replace(/\s/g, '');
  const clave = String(body?.claveCertificado || '');
  if (!p12 && !clave) return null;
  if (!p12 || !clave) throw new AppError('Para el certificado hacen falta el archivo .p12 y su clave', 400);
  if (!/^[A-Za-z0-9+/=]+$/.test(p12) || p12.length > 200000) throw new AppError('Archivo de certificado no válido', 400);
  return { p12, clave };
};

/** Alta de una empresa. Devuelve su clave de API, que no se vuelve a mostrar. */
export const altaEmpresa = asyncHandler(async (req: Request, res: Response) => {
  const rnc = String(req.body?.rnc || '').replace(/\D/g, '');
  const nombre = String(req.body?.nombre || '').trim().slice(0, 150);
  const ambiente = String(req.body?.ambiente || 'cert');
  if (!RNC_VALIDO.test(rnc)) throw new AppError('RNC no válido (9 u 11 dígitos)', 400);
  if (!nombre) throw new AppError('Falta la razón social', 400);
  if (!AMBIENTES.includes(ambiente)) throw new AppError('Ambiente no válido', 400);
  const lista = empresas.completas();
  if (lista.some((e) => e.rnc === rnc)) throw new AppError(`El RNC ${rnc} ya está dado de alta`, 409);
  const cert = leerCertificado(req.body);
  const infoCert = cert ? validarCertificado(cert.p12, cert.clave) : null;
  const { clave, hash } = claveNueva();
  const empresa: Empresa = { rnc, nombre, ambiente: ambiente as Empresa['ambiente'], apiKeySha256: hash };
  lista.push(empresa);
  empresas.guardar(lista);
  if (cert) guardarCertificado(empresa, cert.p12, cert.clave);
  anotar(req, 'alta', rnc, `${nombre} (${ambiente})${cert ? ' con certificado' : ' sin certificado'}`);
  res.status(201).json({ success: true, data: { rnc, apiKey: clave, certificado: infoCert } });
});

/** Cambia nombre, ambiente o suspende/reactiva una empresa. */
export const cambiarEmpresa = asyncHandler(async (req: Request, res: Response) => {
  const empresa = empresaDe(req);
  const cambios: string[] = [];
  const { nombre, ambiente, activa } = req.body || {};
  if (ambiente !== undefined && !AMBIENTES.includes(String(ambiente))) throw new AppError('Ambiente no válido', 400);
  modificar(empresa.rnc, (e) => {
    if (typeof nombre === 'string' && nombre.trim() && nombre.trim() !== e.nombre) {
      e.nombre = nombre.trim().slice(0, 150);
      cambios.push('nombre');
    }
    if (ambiente !== undefined && ambiente !== e.ambiente) {
      cambios.push(`ambiente ${e.ambiente || '?'} → ${ambiente}`);
      e.ambiente = ambiente;
    }
    if (typeof activa === 'boolean' && activa !== (e.activa !== false)) {
      if (activa) delete e.activa; else e.activa = false;
      cambios.push(activa ? 'reactivada' : 'suspendida');
    }
  });
  if (cambios.length) {
    dgiiService.olvidar(empresa.rnc);
    anotar(req, 'cambiar', empresa.rnc, cambios.join(', '));
  }
  res.json({ success: true, data: { rnc: empresa.rnc, cambios } });
});

/** Clave de API nueva: la anterior deja de servir al momento. Se muestra una sola vez. */
export const nuevaClaveEmpresa = asyncHandler(async (req: Request, res: Response) => {
  const empresa = empresaDe(req);
  const { clave, hash } = claveNueva();
  modificar(empresa.rnc, (e) => { e.apiKeySha256 = hash; });
  anotar(req, 'nueva-clave', empresa.rnc);
  res.json({ success: true, data: { rnc: empresa.rnc, apiKey: clave } });
});

/** Sube o renueva el certificado de una empresa (se valida antes de guardar; el anterior se conserva). */
export const subirCertificado = asyncHandler(async (req: Request, res: Response) => {
  const empresa = empresaDe(req);
  const cert = leerCertificado(req.body);
  if (!cert) throw new AppError('Faltan el archivo .p12 y su clave', 400);
  const info = validarCertificado(cert.p12, cert.clave);
  guardarCertificado(empresa, cert.p12, cert.clave);
  anotar(req, 'certificado', empresa.rnc, `vence ${info.vence.slice(0, 10)} · ${info.titular}`);
  logger.info(`Certificado de ${empresa.rnc} renovado desde administración`);
  res.json({ success: true, data: { rnc: empresa.rnc, certificado: info } });
});

/** Lo que llegó por las rutas públicas y no se pudo procesar (ver services/cuarentena.ts). */
export const listarCuarentena = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { total: cuarentena.total(), documentos: cuarentena.listar(Number(req.query.limite) || 100) } });
});

export const leerCuarentena = asyncHandler(async (req: Request, res: Response) => {
  const doc = cuarentena.leer(req.params.id);
  if (!doc) throw new AppError('No existe en la cuarentena', 404);
  res.json({ success: true, data: doc });
});
