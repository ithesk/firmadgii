import { Request, Response } from 'express';
import dgiiService from '../services/dgiiService';
import { ApiResponse, SendInvoiceRequest, SignXmlRequest, InquiryRequest } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config/environment';

export const signXml = asyncHandler(async (req: Request, res: Response) => {
  const { xmlData, documentType } = req.body as SignXmlRequest;

  const result = await dgiiService.signXml(xmlData, documentType);

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

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const { trackId } = req.params;

  const result = await dgiiService.getStatus(trackId);

  const response: ApiResponse = {
    success: true,
    data: result,
  };

  res.json(response);
});

export const getTracks = asyncHandler(async (req: Request, res: Response) => {
  const { rnc, encf } = req.params;

  const result = await dgiiService.getTracks(rnc, encf);

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
  const { environment } = req.query as { environment?: string };

  const result = await dgiiService.getCustomerDirectory(rnc, environment);

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
  const { rnc, accepted, rejectCode } = req.query as any;

  // Usar rncReceptor del query param, o del config (variable de entorno RNC_RECEPTOR)
  const rncReceptor = (req.query.rncReceptor as string) || config.rncReceptor;

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
  console.log('\n========== SEMILLA SOLICITADA ==========');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', JSON.stringify(req.query, null, 2));

  const seedXml = dgiiService.generateSeed();

  console.log('Semilla generada:', seedXml);
  console.log('==========================================\n');

  // Responder con el XML de la semilla
  res.set('Content-Type', 'application/xml');
  res.send(seedXml);
});

/**
 * Endpoint para validar certificado/semilla firmada
 * Path: /fe/autenticacion/api/validacioncertificado
 *
 * El emisor envía la semilla firmada y recibe un token de autenticación
 */
export const validateCertificate = asyncHandler(async (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || '';

  console.log('\n========== VALIDACIÓN CERTIFICADO ==========');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Content-Type:', contentType);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', JSON.stringify(req.query, null, 2));

  let signedSeedXml: string;

  if (req.body instanceof Buffer) {
    signedSeedXml = req.body.toString('utf-8');
    console.log('Body (Buffer -> String):', signedSeedXml);
  } else if (typeof req.body === 'string') {
    signedSeedXml = req.body;
    console.log('Body (String):', signedSeedXml);
  } else if (typeof req.body === 'object' && req.body.signedSeedXml) {
    signedSeedXml = req.body.signedSeedXml;
    console.log('Body (JSON signedSeedXml):', signedSeedXml);
  } else {
    signedSeedXml = String(req.body);
    console.log('Body (Other):', signedSeedXml);
  }

  // Verificar que contiene XML firmado
  if (!signedSeedXml || !signedSeedXml.includes('<?xml') && !signedSeedXml.includes('<SemillaModel')) {
    console.log('Error: XML de semilla firmada no proporcionado');
    console.log('==============================================\n');
    res.status(400).json({
      success: false,
      error: 'Signed seed XML is required',
    });
    return;
  }

  try {
    const token = await dgiiService.validateSignedSeed(signedSeedXml);

    console.log('Token generado:', token);
    console.log('==============================================\n');

    // Responder con el token (formato que espera DGII)
    res.json({
      token,
      expira: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas
    });
  } catch (error: any) {
    console.log('Error validando semilla:', error.message);
    console.log('==============================================\n');

    res.status(401).json({
      success: false,
      error: 'Invalid signed seed: ' + error.message,
    });
  }
});

/**
 * Endpoint receptor para recibir ACECFs (Aprobación Comercial)
 * Este endpoint loguea todo lo que recibe para análisis
 * Path: /fe/aprobacioncomercial/api/ecf
 */
export const receiveAcecf = asyncHandler(async (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || '';

  console.log('\n========== ACECF RECIBIDO ==========');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Content-Type:', contentType);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', JSON.stringify(req.query, null, 2));

  let bodyContent: string;
  let parsedData: any = null;

  if (req.body instanceof Buffer) {
    bodyContent = req.body.toString('utf-8');
    console.log('Body (Buffer -> String):', bodyContent);
  } else if (typeof req.body === 'string') {
    bodyContent = req.body;
    console.log('Body (String):', bodyContent);
  } else if (typeof req.body === 'object') {
    bodyContent = JSON.stringify(req.body, null, 2);
    console.log('Body (Object):', bodyContent);
    parsedData = req.body;
  } else {
    bodyContent = String(req.body);
    console.log('Body (Other):', bodyContent);
  }

  // Si es multipart, intentar parsear
  if (contentType.includes('multipart/form-data')) {
    console.log('\n--- Detectado multipart/form-data ---');
    console.log('Body raw length:', bodyContent.length);
    console.log('Body raw (primeros 2000 chars):', bodyContent.substring(0, 2000));
  }

  // Si contiene XML, intentar extraer información del ACECF
  if (bodyContent.includes('<?xml') || bodyContent.includes('<ACECF')) {
    console.log('\n--- Detectado XML de ACECF ---');

    try {
      // Extraer información del ACECF usando DOMParser
      const { DOMParser } = await import('@xmldom/xmldom');
      const parser = new DOMParser();
      const doc = parser.parseFromString(bodyContent, 'text/xml');

      const getTextContent = (tagName: string): string => {
        const element = doc.getElementsByTagName(tagName)[0];
        return element?.textContent || '';
      };

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

      console.log('\n--- Datos extraídos del ACECF ---');
      console.log(JSON.stringify(acecfInfo, null, 2));

      parsedData = acecfInfo;
    } catch (error) {
      console.log('Error parseando XML:', error);
    }
  }

  console.log('====================================\n');

  // Responder con éxito y los datos parseados
  res.json({
    success: true,
    message: 'ACECF recibido correctamente',
    timestamp: new Date().toISOString(),
    contentType,
    parsedData,
  });
});
