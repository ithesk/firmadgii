import { Request, Response } from 'express';
import dgiiService from '../services/dgiiService';
import { ApiResponse, SendInvoiceRequest, SignXmlRequest, InquiryRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config/environment';
import logger from '../utils/logger';
import { bandeja } from '../services/bandeja';

export const signXml = asyncHandler(async (req: Request, res: Response) => {
  const { xmlData, documentType } = req.body as SignXmlRequest;
  // rnc opcional: con varios certificados, firma con el de ese RNC
  const { rnc } = req.body as { rnc?: string };

  const result = await dgiiService.signXml(xmlData, documentType, rnc);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

/**
 * Detecta el tipo de documento (nodo raíz) de un XML
 */
function detectDocumentType(xmlData: string): string | null {
  // Lista de tipos conocidos de DGII
  const knownTypes = ['ECF', 'RFCE', 'ARECF', 'ACECF', 'ANECF', 'SemillaModel'];

  for (const type of knownTypes) {
    if (xmlData.includes(`<${type}`) || xmlData.includes(`<${type}>`)) {
      return type;
    }
  }

  // Si no es un tipo conocido, intentar detectar el primer elemento raíz
  // Buscar el primer tag después del prólogo XML
  const match = xmlData.match(/<\?xml[^?]*\?>\s*<([a-zA-Z_][a-zA-Z0-9_-]*)/);
  if (match && match[1]) {
    return match[1];
  }

  // Buscar el primer tag si no hay prólogo
  const matchNoProlog = xmlData.match(/^\s*<([a-zA-Z_][a-zA-Z0-9_-]*)/);
  if (matchNoProlog && matchNoProlog[1]) {
    return matchNoProlog[1];
  }

  return null;
}

/**
 * Endpoint para firmar un archivo XML directamente
 * Acepta XML como body y devuelve el XML firmado para descarga
 * Path: /api/invoice/sign-file
 *
 * Detecta automáticamente el tipo de documento del XML
 */
export const signXmlFile = asyncHandler(async (req: Request, res: Response) => {
  // documentType es opcional - si no se provee, se detecta automáticamente
  let documentType = req.query.documentType as string | undefined;
  const rnc = req.query.rnc as string | undefined;
  const download = req.query.download !== 'false'; // Por defecto descargar

  console.log('\n========== SIGN XML FILE ==========');
  console.log('Query params:', JSON.stringify(req.query, null, 2));
  console.log('Initial documentType from query:', documentType);

  let xmlData: string;

  // Obtener el XML del body (puede venir como Buffer, string, o en multipart)
  if (req.body instanceof Buffer) {
    xmlData = req.body.toString('utf-8');
  } else if (typeof req.body === 'string') {
    xmlData = req.body;
  } else if (typeof req.body === 'object' && req.body.xmlData) {
    // También soportar JSON con xmlData por compatibilidad
    xmlData = req.body.xmlData;
  } else {
    res.status(400).json({
      success: false,
      error: 'XML data is required. Send XML as raw body or as xmlData field',
    });
    return;
  }

  // Validar que contenga XML
  if (!xmlData.includes('<')) {
    res.status(400).json({
      success: false,
      error: 'Invalid XML format. The body must contain valid XML',
    });
    return;
  }

  // Si no se especificó documentType, detectarlo automáticamente
  if (!documentType) {
    const detected = detectDocumentType(xmlData);
    console.log('Detection result:', detected);
    console.log('XML preview (first 500 chars):', xmlData.substring(0, 500));
    if (!detected) {
      res.status(400).json({
        success: false,
        error: 'Could not detect document type. Please specify documentType query parameter',
      });
      return;
    }
    documentType = detected;
    console.log(`Using detected document type: ${documentType}`);
  }

  console.log(`Final documentType to use: ${documentType}`);
  console.log('==========================================\n');

  const result = await dgiiService.signXml(xmlData, documentType, rnc);

  if (download) {
    // Generar nombre de archivo basado en el tipo y timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${documentType}_signed_${timestamp}.xml`;

    res.set('Content-Type', 'application/xml');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(result.signedXml);
  } else {
    // Solo devolver el XML sin forzar descarga
    res.set('Content-Type', 'application/xml');
    res.send(result.signedXml);
  }
});

export const sendInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { invoiceData, rnc, encf, environment } = req.body as SendInvoiceRequest;

  const result = await dgiiService.sendInvoice(invoiceData, rnc, encf, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const prepareInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { invoiceData, rnc, encf, environment } = req.body;
  const result = await dgiiService.prepareInvoice(invoiceData, rnc, encf, environment);
  res.json({ success: true, data: result } as ApiResponse);
});

export const sendSigned = asyncHandler(async (req: Request, res: Response) => {
  const { signedXml, rnc, encf, tipo, environment } = req.body;
  const result = await dgiiService.sendSigned(signedXml, rnc, encf, tipo, environment);
  res.json({ success: true, data: result } as ApiResponse);
});

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const { trackId } = req.params;
  // Sin rnc/environment se usan el certificado y el ambiente por defecto del servicio
  const { rnc, environment } = req.query as { rnc?: string; environment?: string };

  const result = await dgiiService.getStatus(trackId, rnc, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const getTracks = asyncHandler(async (req: Request, res: Response) => {
  const { rnc, encf } = req.params;
  const { environment } = req.query as { environment?: string };

  const result = await dgiiService.getTracks(rnc, encf, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const inquire = asyncHandler(async (req: Request, res: Response) => {
  const { rncEmisor, encf, rncComprador, securityCode } = req.body as InquiryRequest;

  const result = await dgiiService.inquiryStatus(rncEmisor, encf, rncComprador, securityCode);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const sendSummary = asyncHandler(async (req: Request, res: Response) => {
  const { invoiceData, rnc, encf, environment } = req.body;

  const result = await dgiiService.sendSummary(invoiceData, rnc, encf, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const sendReceipt = asyncHandler(async (req: Request, res: Response) => {
  const { receiptData, rnc, environment } = req.body;

  const result = await dgiiService.sendReceipt(receiptData, rnc, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const sendApproval = asyncHandler(async (req: Request, res: Response) => {
  const { approvalData, fileName, rnc, environment } = req.body;

  const result = await dgiiService.sendApproval(approvalData, fileName, rnc, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const voidSequence = asyncHandler(async (req: Request, res: Response) => {
  const { voidData, fileName, rnc, environment } = req.body;

  const result = await dgiiService.voidSequence(voidData, fileName, rnc, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const getCustomerDirectory = asyncHandler(async (req: Request, res: Response) => {
  const { rnc } = req.params;
  const { certRnc, environment } = req.query as { certRnc?: string; environment?: string };

  // rnc = RNC a consultar en el directorio
  // certRnc = RNC para cargar el certificado de autenticación (opcional)
  const result = await dgiiService.getCustomerDirectory(rnc, certRnc, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const generateQR = asyncHandler(async (req: Request, res: Response) => {
  const { rncEmisor, rncComprador, encf, montoTotal, securityCode, fechaEmision, fechaFirma, environment } = req.query as any;

  const qrCodeUrl = dgiiService.generateQRCode({
    rncEmisor,
    rncComprador,
    encf,
    montoTotal: parseFloat(montoTotal),
    securityCode,
    fechaEmision,
    fechaFirma,
    environment,
  });

  const response: ApiResponse = {
    success: true,
    data: { qrCodeUrl },
  };

  res.json(response);
});

export const sendSummaryWithEcf = asyncHandler(async (req: Request, res: Response) => {
  const { invoiceData, rnc, encf, environment } = req.body;

  const result = await dgiiService.sendSummaryWithEcf(invoiceData, rnc, encf, environment);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

/**
 * Endpoint receptor para recibir ECFs y responder con ARECF firmado
 * Este es el endpoint que DGII (o emisores) llamarán para enviar sus ECFs
 * y esperan recibir el ARECF firmado como respuesta
 *
 * Soporta dos modos:
 * 1. multipart/form-data - DGII envía el XML como archivo (estándar Emisor-Receptor)
 * 2. application/json - Para enviar el XML directamente desde Odoo u otros sistemas
 */
export const receiveEcf = asyncHandler(async (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || '';
  const { accepted, rejectCode } = req.query as any;
  // En la ruta pública /{RNC}/fe/... el certificado es siempre el de esa empresa:
  // nunca se acepta ?rnc= del exterior (firmaría con el certificado de otra)
  const rnc = req.params.rnc || (req.query.rnc as string | undefined);

  // RNC receptor: el de la ruta /{RNC}/fe/... (multiempresa), el del query o RNC_RECEPTOR
  const rncReceptor = req.params.rnc || (req.query.rncReceptor as string) || config.rncReceptor;

  if (!rncReceptor) {
    res.status(400).json({
      success: false,
      error: 'rncReceptor query parameter is required or set RNC_RECEPTOR env variable',
    });
    return;
  }

  let result;

  if (contentType.includes('multipart/form-data')) {
    // Modo estándar DGII: multipart/form-data con el XML como archivo
    // El body ya viene como Buffer gracias a express.raw()
    const bodyStr = req.body instanceof Buffer ? req.body.toString() : req.body;
    result = await dgiiService.processMultipartEcf(
      bodyStr,
      contentType,
      rncReceptor,
      rnc,
      false
    );
  } else if (contentType.includes('application/json')) {
    // Modo alternativo: JSON con el XML del ECF
    const { ecfXml } = req.body;

    if (!ecfXml) {
      res.status(400).json({
        success: false,
        error: 'ecfXml is required in request body',
      });
      return;
    }

    result = await dgiiService.processReceivedEcf(
      ecfXml,
      rncReceptor,
      rnc,
      accepted !== 'false',
      rejectCode
    );
  } else {
    // Intentar parsear como XML directo
    const bodyStr = req.body instanceof Buffer ? req.body.toString() : req.body;

    if (typeof bodyStr === 'string' && bodyStr.includes('<?xml')) {
      result = await dgiiService.processReceivedEcf(
        bodyStr,
        rncReceptor,
        rnc,
        accepted !== 'false',
        rejectCode
      );
    } else {
      res.status(400).json({
        success: false,
        error: 'Unsupported content type. Use multipart/form-data, application/json, or send raw XML',
      });
      return;
    }
  }

  // Responder con el ARECF firmado como XML
  // Este es el comportamiento esperado por el estándar Emisor-Receptor
  res.set('Content-Type', 'application/xml');
  res.send(result.signedArecfXml);
});

/**
 * Endpoint alternativo que retorna el ARECF en formato JSON
 * útil para depuración o integración con sistemas que prefieren JSON
 */
export const receiveEcfJson = asyncHandler(async (req: Request, res: Response) => {
  const { ecfXml, rncReceptor, rnc, accepted, rejectCode } = req.body;

  if (!ecfXml || !rncReceptor) {
    res.status(400).json({
      success: false,
      error: 'ecfXml and rncReceptor are required',
    });
    return;
  }

  const result = await dgiiService.processReceivedEcf(
    ecfXml,
    rncReceptor,
    rnc,
    accepted !== false,
    rejectCode
  );

  const response: ApiResponse = {
    success: true,
    data: {
      signedArecfXml: result.signedArecfXml,
      arecfData: result.arecfData,
    },
  };

  res.json(response);
});

/**
 * Envía una Aprobación Comercial (ACECF) a DGII
 * Se usa para aprobar o rechazar comercialmente un ECF recibido
 */
export const sendAcecf = asyncHandler(async (req: Request, res: Response) => {
  const {
    rncEmisor,
    eNCF,
    fechaEmision,
    montoTotal,
    rncComprador,
    estado,
    detalleMotivoRechazo,
    rnc,
    environment,
  } = req.body;

  // Validaciones
  if (!rncEmisor || !eNCF || !fechaEmision || montoTotal === undefined || !rncComprador || !estado) {
    res.status(400).json({
      success: false,
      error: 'Missing required fields: rncEmisor, eNCF, fechaEmision, montoTotal, rncComprador, estado',
    });
    return;
  }

  if (!['1', '2'].includes(estado)) {
    res.status(400).json({
      success: false,
      error: 'Invalid estado. Must be "1" (Aprobado) or "2" (Rechazado)',
    });
    return;
  }

  if (estado === '2' && !detalleMotivoRechazo) {
    res.status(400).json({
      success: false,
      error: 'detalleMotivoRechazo is required when estado is "2" (Rechazado)',
    });
    return;
  }

  const result = await dgiiService.sendCommercialApproval(
    {
      rncEmisor,
      eNCF,
      fechaEmision,
      montoTotal: parseFloat(montoTotal),
      rncComprador,
      estado,
      detalleMotivoRechazo,
    },
    rnc,
    environment
  );

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

/**
 * Procesa un ECF recibido y envía la aprobación/rechazo comercial a DGII
 * Extrae automáticamente los datos del ECF XML
 */
export const processAcecfFromEcf = asyncHandler(async (req: Request, res: Response) => {
  const { ecfXml, estado, motivoRechazo, rnc, environment } = req.body;

  if (!ecfXml || !estado) {
    res.status(400).json({
      success: false,
      error: 'ecfXml and estado are required',
    });
    return;
  }

  if (!['1', '2'].includes(estado)) {
    res.status(400).json({
      success: false,
      error: 'Invalid estado. Must be "1" (Aprobado) or "2" (Rechazado)',
    });
    return;
  }

  if (estado === '2' && !motivoRechazo) {
    res.status(400).json({
      success: false,
      error: 'motivoRechazo is required when estado is "2" (Rechazado)',
    });
    return;
  }

  const result = await dgiiService.processCommercialApproval(
    ecfXml,
    estado,
    motivoRechazo,
    rnc,
    environment
  );

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

/**
 * Endpoint para generar semilla de autenticación
 * Path: /fe/autenticacion/api/semilla
 *
 * El emisor llama a este endpoint para obtener una semilla XML
 * que debe firmar con su certificado y enviar a validacioncertificado
 */
export const getSeed = asyncHandler(async (req: Request, res: Response) => {
  // Multiempresa: la semilla la genera el certificado de la empresa de la ruta /{RNC}/fe/...
  const rnc = req.params.rnc || (req.query.rnc as string) || undefined;
  logger.info(`Semilla solicitada para ${rnc || '-'} desde ${req.ip}`);
  const seedXml = dgiiService.generateSeed(rnc);
  res.set('Content-Type', 'application/xml');
  res.send(seedXml);
});

/**
 * Endpoint para validar certificado/semilla firmada
 * Path: /fe/autenticacion/api/validacioncertificado
 *
 * El emisor envía la semilla firmada y recibe un token de autenticación.
 * No se registra ni la semilla ni el token: el token da acceso a la recepción.
 */
export const validateCertificate = asyncHandler(async (req: Request, res: Response) => {
  let signedSeedXml: string;
  if (req.body instanceof Buffer) {
    signedSeedXml = req.body.toString('utf-8');
  } else if (typeof req.body === 'string') {
    signedSeedXml = req.body;
  } else if (typeof req.body === 'object' && req.body.signedSeedXml) {
    signedSeedXml = req.body.signedSeedXml;
  } else {
    signedSeedXml = String(req.body);
  }

  if (!signedSeedXml || !signedSeedXml.includes('<?xml') && !signedSeedXml.includes('<SemillaModel')) {
    logger.info(`Validación de certificado sin semilla firmada desde ${req.ip}`);
    res.status(400).json({ success: false, error: 'Signed seed XML is required' });
    return;
  }

  const rnc = req.params.rnc || (req.query.rnc as string) || undefined;
  try {
    const token = await dgiiService.validateSignedSeed(signedSeedXml, rnc);
    logger.info(`Token emitido para ${rnc || '-'} a ${req.ip}`);
    res.json({
      token,
      expira: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas
    });
  } catch (error: any) {
    logger.warn(`Semilla firmada no válida para ${rnc || '-'} desde ${req.ip}: ${error.message}`);
    res.status(401).json({ success: false, error: 'Invalid signed seed: ' + error.message });
  }
});

/**
 * Endpoint receptor para recibir ACECFs (Aprobación Comercial)
 * Path: /fe/aprobacioncomercial/api/ecf
 *
 * Guarda la aprobación en la bandeja de la empresa (Odoo la recoge) y responde 200.
 */
export const receiveAcecf = asyncHandler(async (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || '';
  let bodyContent: string;
  let parsedData: any = null;

  if (req.body instanceof Buffer) {
    bodyContent = req.body.toString('utf-8');
  } else if (typeof req.body === 'string') {
    bodyContent = req.body;
  } else if (typeof req.body === 'object') {
    bodyContent = JSON.stringify(req.body);
    parsedData = req.body;
  } else {
    bodyContent = String(req.body);
  }

  if (bodyContent.includes('<?xml') || bodyContent.includes('<ACECF')) {
    try {
      const { DOMParser } = await import('@xmldom/xmldom');
      const doc = new DOMParser().parseFromString(bodyContent, 'text/xml');
      const getTextContent = (tagName: string): string => doc.getElementsByTagName(tagName)[0]?.textContent || '';

      const acecfInfo = {
        version: getTextContent('Version'),
        rncEmisor: getTextContent('RNCEmisor'),
        eNCF: getTextContent('eNCF'),
        fechaEmision: getTextContent('FechaEmision'),
        montoTotal: getTextContent('MontoTotal'),
        rncComprador: getTextContent('RNCComprador'),
        estado: getTextContent('Estado'),
        detalleMotivoRechazo: getTextContent('DetalleMotivoRechazo'),
        fechaHoraAprobacionComercial: getTextContent('FechaHoraAprobacionComercial'),
      };
      parsedData = acecfInfo;
      logger.info(`ACECF recibido desde ${req.ip}: ${acecfInfo.eNCF} de ${acecfInfo.rncComprador}, estado ${acecfInfo.estado}`);
      // Para la empresa de la ruta /{RNC}/fe/aprobacioncomercial (o RNC_RECEPTOR): el emisor del e-CF aprobado
      const rncReceptor = req.params.rnc || config.rncReceptor || acecfInfo.rncEmisor;
      if (rncReceptor) {
        dgiiService.notificarAprobacion(rncReceptor, bodyContent, acecfInfo);
      }
    } catch (error: any) {
      logger.error(`ACECF no válido desde ${req.ip}: ${error.message}`);
    }
  } else {
    logger.warn(`Aprobación comercial sin XML desde ${req.ip} (${contentType})`);
  }

  res.json({
    success: true,
    message: 'ACECF recibido correctamente',
    timestamp: new Date().toISOString(),
    parsedData,
  });
});

/** Entrega un e-CF firmado al comprador (si es receptor electrónico) y devuelve su acuse. */
export const deliverToBuyer = asyncHandler(async (req: Request, res: Response) => {
  const { signedXml, encf, rncComprador, rnc, environment } = req.body;
  if (!signedXml || !encf || !rncComprador) {
    res.status(400).json({ success: false, error: 'signedXml, encf y rncComprador son obligatorios' });
    return;
  }
  const result = await dgiiService.entregarAlComprador(signedXml, encf, String(rncComprador), rnc, environment);
  res.json({ success: true, data: result } as ApiResponse);
});

/** Bandeja: documentos recibidos para la empresa de la clave que Odoo aún no recogió. */
export const listarBandeja = asyncHandler(async (req: Request, res: Response) => {
  const rnc = String(req.query.rnc || '');
  const limite = parseInt(String(req.query.limit || '50'), 10) || 50;
  res.json({ success: true, data: { documentos: bandeja.listar(rnc, limite) } } as ApiResponse);
});

/** Bandeja: Odoo confirma lo que ya procesó (pasa a entregados). */
export const confirmarBandeja = asyncHandler(async (req: Request, res: Response) => {
  const rnc = String(req.body.rnc || '');
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  res.json({ success: true, data: { confirmados: bandeja.confirmar(rnc, ids) } } as ApiResponse);
});
