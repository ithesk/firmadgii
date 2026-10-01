import ECF, { ENVIRONMENT, Signature, Transformer, generateEcfQRCodeURL, generateFcQRCodeURL, getCodeSixDigitfromSignature, SenderReceiver, ReceivedStatus, NoReceivedCode, CustomAuthentication } from 'dgii-ecf';
import axios from 'axios';
import config from '../config/environment';
import logger from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import certificateService from './certificateService';
import { InvoiceData } from '../types';
import { DOMParser } from '@xmldom/xmldom';

// Instancia del SenderReceiver para procesar ECFs recibidos
const senderReceiver = new SenderReceiver();

/** Mensaje útil de un error de la DGII: el cuerpo de la respuesta (mensajes de validación), no solo el código HTTP. */
export const mensajeDgii = (error: any): string => {
  const datos = error?.response?.data ?? error?.data;
  if (datos) {
    const texto = typeof datos === 'string' ? datos : JSON.stringify(datos);
    // Las páginas de error HTML de la DGII no aportan: se resume
    return /<!DOCTYPE|<html/i.test(texto) ? `HTTP ${error?.response?.status || ''} de la DGII` : texto.slice(0, 2000);
  }
  return error?.message || String(error);
};

/** Fecha y hora de firma como la pide la DGII (dd-MM-yyyy HH:mm:ss), en hora de Santo Domingo. */
export const fechaHoraFirmaRD = (fecha: Date = new Date()): string => {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(fecha).reduce((acc: any, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${partes.day}-${partes.month}-${partes.year} ${partes.hour}:${partes.minute}:${partes.second}`;
};

export class DGIIService {
  // Token de la DGII por RNC y ambiente: dura 1 hora, no hace falta pedirlo en cada documento
  private tokens = new Map<string, { token: string; vence: number }>();

  /** ECF autenticado, reutilizando el token mientras no esté por vencer. */
  private async ecfAutenticado(rnc?: string, environment?: string, renovar = false): Promise<{ ecf: any; env: any }> {
    const certs = certificateService.getCertificate(rnc);
    const env = this.getEnvironment(environment);
    const clave = `${rnc || 'default'}|${env}`;
    const guardado = this.tokens.get(clave);
    if (!renovar && guardado && guardado.vence > Date.now() + 2 * 60 * 1000) {
      return { ecf: new ECF(certs, env, guardado.token), env };
    }
    const ecf = new ECF(certs, env);
    const tokenData: any = await ecf.authenticate();
    let vence = Date.parse(tokenData?.expira || '');
    if (Number.isNaN(vence)) {
      vence = Date.now() + 55 * 60 * 1000;
    }
    this.tokens.set(clave, { token: tokenData.token, vence });
    return { ecf, env };
  }

  /** Ejecuta una llamada a la DGII; si el token fue rechazado (401), lo renueva y reintenta una vez. */
  private async conDgii<T>(rnc: string | undefined, environment: string | undefined, llamada: (ecf: any, env: any) => Promise<T>): Promise<T> {
    const { ecf, env } = await this.ecfAutenticado(rnc, environment);
    try {
      return await llamada(ecf, env);
    } catch (error: any) {
      const estado = error?.response?.status || error?.status;
      if (estado !== 401 && !/401|unauthorized/i.test(String(error?.message || ''))) {
        throw error;
      }
      const otro = await this.ecfAutenticado(rnc, environment, true);
      return llamada(otro.ecf, otro.env);
    }
  }

  /** Añade FechaHoraFirma al ECF si no la trae (al final del documento, como exige el formato). */
  private conFechaFirma(invoiceData: InvoiceData): string {
    const ecfData: any = (invoiceData as any).ECF;
    if (ecfData && !ecfData.FechaHoraFirma) {
      ecfData.FechaHoraFirma = fechaHoraFirmaRD();
    }
    return ecfData?.FechaHoraFirma || fechaHoraFirmaRD();
  }

  /** Resumen de factura de consumo (RFCE) a partir del encabezado del ECF ya firmado. */
  private rfceDesdeEcf(encabezado: any, rnc: string, encf: string, codigoSeguridad: string): any {
    const totalesEcf = encabezado.Totales || {};
    // Totales que admite el RFCE, en el orden del formato; se copian los que traiga el ECF
    const campos = ['MontoGravadoTotal', 'MontoGravadoI1', 'MontoGravadoI2', 'MontoGravadoI3', 'MontoExento',
      'TotalITBIS', 'TotalITBIS1', 'TotalITBIS2', 'TotalITBIS3', 'MontoImpuestoAdicional', 'MontoTotal', 'MontoNoFacturable'];
    const totales: any = {};
    for (const campo of campos) {
      if (totalesEcf[campo] !== undefined && totalesEcf[campo] !== null) {
        totales[campo] = totalesEcf[campo];
      }
    }
    totales.MontoPeriodo = totalesEcf.MontoTotal || 0;
    return {
      RFCE: {
        Encabezado: {
          Version: encabezado.Version || '1.0',
          IdDoc: {
            TipoeCF: 32,
            eNCF: encabezado.IdDoc?.eNCF || encf,
            TipoIngresos: encabezado.IdDoc?.TipoIngresos || '01',
            TipoPago: encabezado.IdDoc?.TipoPago || 1,
          },
          Emisor: {
            RNCEmisor: encabezado.Emisor?.RNCEmisor || rnc,
            RazonSocialEmisor: encabezado.Emisor?.RazonSocialEmisor,
            FechaEmision: encabezado.Emisor?.FechaEmision,
          },
          ...(encabezado.Comprador?.RNCComprador ? {
            Comprador: {
              RNCComprador: encabezado.Comprador.RNCComprador,
              RazonSocialComprador: encabezado.Comprador.RazonSocialComprador,
            },
          } : {}),
          Totales: totales,
          CodigoSeguridadeCF: codigoSeguridad,
        },
      },
    };
  }

  /**
   * Firma sin enviar: lo usa Odoo para imprimir el comprobante al momento (código de seguridad, fecha de firma, QR)
   * y enviarlo después con sendSigned. Para consumo E32 < RD$250.000 prepara además el RFCE.
   */
  async prepareInvoice(invoiceData: InvoiceData, rnc: string, encf: string, environment?: string): Promise<any> {
    const encabezado: any = (invoiceData as any).ECF?.Encabezado;
    if (!encabezado) {
      throw new AppError('Invalid ECF data: missing Encabezado', 400);
    }
    const env = this.getEnvironment(environment);
    const fechaHoraFirma = this.conFechaFirma(invoiceData);
    const transformer = new Transformer();
    const { signedXml, securityCode } = await this.signXml(transformer.json2xml(invoiceData), 'ECF', rnc);
    const montoTotal = Number(encabezado.Totales?.MontoTotal || 0);
    const esResumen = Number(encabezado.IdDoc?.TipoeCF) === 32 && montoTotal < 250000;
    const resultado: any = { encf, securityCode, fechaHoraFirma, signedXml, tipoEnvio: esResumen ? 'RFCE' : 'ECF' };
    if (esResumen) {
      const rfce = this.rfceDesdeEcf(encabezado, rnc, encf, securityCode);
      resultado.signedRfceXml = (await this.signXml(transformer.json2xml(rfce), 'RFCE', rnc)).signedXml;
      resultado.qrCodeUrl = generateFcQRCodeURL(rnc, encf, montoTotal, securityCode, env);
    } else {
      resultado.qrCodeUrl = generateEcfQRCodeURL(rnc, encabezado.Comprador?.RNCComprador || '', encf,
        String(encabezado.Totales?.MontoTotal), encabezado.Emisor?.FechaEmision, fechaHoraFirma, securityCode, env);
    }
    return resultado;
  }

  /** Envía a la DGII un documento ya firmado (ECF completo o RFCE). */
  async sendSigned(signedXml: string, rnc: string, encf: string, tipo: 'ECF' | 'RFCE', environment?: string): Promise<any> {
    try {
      const archivo = `${rnc}${encf}.xml`;
      logger.info(`Sending signed ${tipo} - RNC: ${rnc}, e-NCF: ${encf}`);
      const response: any = await this.conDgii(rnc, environment, (ecf) =>
        tipo === 'RFCE' ? ecf.sendSummary(signedXml, archivo) : ecf.sendElectronicDocument(signedXml, archivo));
      return { ...response, encf, tipo };
    } catch (error: any) {
      logger.error('Error sending signed document:', error);
      throw new AppError(`Error sending signed document: ${mensajeDgii(error)}`, 500);
    }
  }

  private getEnvironment(env?: string): any {
    const environment = env || config.dgiiEnvironment;
    switch (environment) {
      case 'test':
        return ENVIRONMENT.DEV;
      case 'cert':
        return ENVIRONMENT.CERT;
      case 'prod':
        return ENVIRONMENT.PROD;
      default:
        return ENVIRONMENT.DEV;
    }
  }

  async authenticate(rnc?: string, environment?: string): Promise<any> {
    try {
      logger.info(`Authenticating with DGII - RNC: ${rnc || 'default'}, Env: ${environment || config.dgiiEnvironment}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const ecf = new ECF(certs, env);
      const tokenData = await ecf.authenticate();

      logger.info('Authentication successful');
      return tokenData;
    } catch (error: any) {
      logger.error('Authentication error:', error);
      throw new AppError(`Authentication failed: ${error.message}`, 500);
    }
  }

  async signXml(xmlData: string, documentType: string, rnc?: string): Promise<{ signedXml: string; securityCode: string }> {
    try {
      logger.info(`Signing XML - Type: ${documentType}, RNC: ${rnc || 'default'}`);

      const certs = certificateService.getCertificate(rnc);
      const signature = new Signature(certs.key, certs.cert);

      const signedXml = signature.signXml(xmlData, documentType) as string;
      const securityCode = getCodeSixDigitfromSignature(signedXml) as string;

      logger.info('XML signed successfully');
      return { signedXml, securityCode };
    } catch (error: any) {
      logger.error('Error signing XML:', error);
      throw new AppError(`Error signing XML: ${error.message}`, 500);
    }
  }

  async sendInvoice(invoiceData: InvoiceData, rnc: string, encf: string, environment?: string): Promise<any> {
    try {
      logger.info(`Sending invoice - RNC: ${rnc}, e-NCF: ${encf}`);

      const fechaFirma = this.conFechaFirma(invoiceData);
      const transformer = new Transformer();
      const xml = transformer.json2xml(invoiceData);

      const { signedXml, securityCode } = await this.signXml(xml, 'ECF', rnc);

      const env = this.getEnvironment(environment);
      const response: any = await this.conDgii<any>(rnc, environment, (ecf) => ecf.sendElectronicDocument(signedXml, `${rnc}${encf}.xml`));

      const rncComprador = invoiceData.ECF?.Encabezado?.Comprador?.RNCComprador;
      const montoTotal = invoiceData.ECF?.Encabezado?.Totales?.MontoTotal;
      const fechaEmision = invoiceData.ECF?.Encabezado?.Emisor?.FechaEmision;

      const qrCodeUrl = generateEcfQRCodeURL(
        rnc,
        rncComprador,
        encf,
        montoTotal,
        fechaEmision,
        fechaFirma,
        securityCode,
        env
      );

      logger.info(`Invoice sent successfully - TrackID: ${response?.trackId || 'unknown'}`);

      return {
        ...response,
        signedXml,
        securityCode,
        fechaHoraFirma: fechaFirma,
        qrCodeUrl,
      };
    } catch (error: any) {
      logger.error('Error sending invoice:', error);
      throw new AppError(`Error sending invoice: ${mensajeDgii(error)}`, 500);
    }
  }

  async getStatus(trackId: string, rnc?: string, environment?: string): Promise<any> {
    try {
      logger.info(`Getting status for trackID: ${trackId}`);

      const status = await this.conDgii(rnc, environment, (ecf) => ecf.statusTrackId(trackId));

      logger.info(`Status retrieved successfully for trackID: ${trackId}`);
      return status;
    } catch (error: any) {
      logger.error('Error getting status:', error);
      throw new AppError(`Error getting status: ${mensajeDgii(error)}`, 500);
    }
  }

  async getTracks(rnc: string, encf: string, environment?: string): Promise<any> {
    try {
      logger.info(`Getting tracks for RNC: ${rnc}, e-NCF: ${encf}`);

      const tracks = await this.conDgii(rnc, environment, (ecf) => ecf.trackStatuses(rnc, encf));

      logger.info(`Tracks retrieved successfully`);
      return tracks;
    } catch (error: any) {
      logger.error('Error getting tracks:', error);
      throw new AppError(`Error getting tracks: ${error.message}`, 500);
    }
  }

  async inquiryStatus(rncEmisor: string, encf: string, rncComprador?: string, securityCode?: string, environment?: string): Promise<any> {
    try {
      logger.info(`Inquiry status - RNC Emisor: ${rncEmisor}, e-NCF: ${encf}`);

      const inquiry = await this.conDgii(rncEmisor, environment, (ecf) => ecf.inquiryStatus(rncEmisor, encf, rncComprador, securityCode));

      logger.info('Inquiry completed successfully');
      return inquiry;
    } catch (error: any) {
      logger.error('Error in inquiry:', error);
      throw new AppError(`Error in inquiry: ${error.message}`, 500);
    }
  }

  async sendSummary(invoiceData: InvoiceData, rnc: string, encf: string, environment?: string): Promise<any> {
    try {
      logger.info(`Sending summary (RFCE) - RNC: ${rnc}, e-NCF: ${encf}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const { ecf } = await this.ecfAutenticado(rnc, environment);

      const transformer = new Transformer();
      const xml = transformer.json2xml(invoiceData);

      const { signedXml, securityCode } = await this.signXml(xml, 'RFCE', rnc);

      const response: any = await ecf.sendSummary(signedXml, `${rnc}${encf}.xml`);

      logger.info(`Summary sent successfully - TrackID: ${response?.trackId || 'unknown'}`);

      return {
        ...response,
        signedXml,
        securityCode,
      };
    } catch (error: any) {
      logger.error('Error sending summary:', error);
      throw new AppError(`Error sending summary: ${mensajeDgii(error)}`, 500);
    }
  }

  async sendSummaryWithEcf(ecfData: InvoiceData, rnc: string, encf: string, environment?: string): Promise<any> {
    try {
      logger.info(`Sending summary with ECF - RNC: ${rnc}, e-NCF: ${encf}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const { ecf } = await this.ecfAutenticado(rnc, environment);

      const transformer = new Transformer();

      // 1. Firmar ECF completo (con DetallesItems) para guardar localmente
      const ecfXml = transformer.json2xml(ecfData);
      const { signedXml: signedEcfXml, securityCode: ecfSecurityCode } = await this.signXml(ecfXml, 'ECF', rnc);

      // 2. Convertir ECF a RFCE (extraer solo Encabezado, sin DetallesItems)
      const ecfEncabezado = ecfData.ECF?.Encabezado;
      if (!ecfEncabezado) {
        throw new AppError('Invalid ECF data: missing Encabezado', 400);
      }

      const rfceData = this.rfceDesdeEcf(ecfEncabezado, rnc, encf, ecfSecurityCode);

      // 3. Firmar RFCE y enviar a DGII
      const rfceXml = transformer.json2xml(rfceData);
      const { signedXml: signedRfceXml, securityCode: rfceSecurityCode } = await this.signXml(rfceXml, 'RFCE', rnc);

      const response: any = await ecf.sendSummary(signedRfceXml, `${rnc}${encf}.xml`);

      logger.info(`Summary with ECF sent successfully - TrackID: ${response?.trackId || 'unknown'}`);

      // 4. Generar QR Code URL (usando FC para facturas de consumo)
      const qrCodeUrl = generateFcQRCodeURL(
        rnc,
        encf,
        ecfEncabezado.Totales?.MontoTotal || 0,
        ecfSecurityCode,
        env
      );

      return {
        ...response,
        signedEcfXml,
        signedRfceXml,
        ecfSecurityCode,
        rfceSecurityCode,
        qrCodeUrl,
      };
    } catch (error: any) {
      logger.error('Error sending summary with ECF:', error);
      throw new AppError(`Error sending summary with ECF: ${error.message}`, 500);
    }
  }

  async sendReceipt(receiptData: any, rnc?: string, environment?: string): Promise<any> {
    try {
      // Extraer RNCComprador y eNCF del ARECF para generar el nombre del archivo
      const rncComprador = receiptData.ARECF?.DetalleAcusedeRecibo?.RNCComprador;
      const encf = receiptData.ARECF?.DetalleAcusedeRecibo?.eNCF;

      if (!rncComprador || !encf) {
        throw new AppError('Missing RNCComprador or eNCF in receipt data', 400);
      }

      // Nomenclatura DGII: RNCComprador + e-NCF + .xml
      const fileName = `${rncComprador}${encf}.xml`;

      logger.info(`Sending receipt (ARECF) - RNC: ${rnc || 'default'}, File: ${fileName}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      // Agregar namespaces requeridos por DGII al elemento ARECF
      const dataWithNamespaces = {
        ...receiptData,
        ARECF: {
          _attributes: {
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
          },
          ...receiptData.ARECF,
        },
      };

      const transformer = new Transformer();
      let xml = transformer.json2xml(dataWithNamespaces);

      // Reemplazar declaración XML para que coincida con formato DGII
      xml = xml.replace('<?xml version="1.0" encoding="utf-8"?>', '<?xml version="1.0"?>');

      const { signedXml } = await this.signXml(xml, 'ARECF', rnc);

      // Log del XML firmado completo para debug
      logger.info('=== ARECF XML FIRMADO (INICIO) ===');
      logger.info(signedXml);
      logger.info('=== ARECF XML FIRMADO (FIN) ===');

      // En certificación DGII, el ARECF se envía al endpoint estándar de facturas
      // Nota: El endpoint /fe/recepcion/api/ecf no existe en DGII cert (404)
      const { ecf } = await this.ecfAutenticado(rnc, environment);

      logger.info(`Sending ARECF to DGII standard endpoint`);

      // Enviar al endpoint estándar de DGII
      const response: any = await ecf.sendElectronicDocument(signedXml, fileName);

      logger.info(`Receipt sent successfully - TrackID: ${response?.trackId || 'unknown'}`);
      return {
        ...response,
        signedXml,
        fileName,
      };
    } catch (error: any) {
      logger.error('Error sending receipt:', error);
      throw new AppError(`Error sending receipt: ${error.message}`, 500);
    }
  }

  async sendApproval(approvalData: any, fileName: string, rnc?: string, environment?: string): Promise<any> {
    try {
      logger.info(`Sending commercial approval - RNC: ${rnc || 'default'}, File: ${fileName}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const { ecf } = await this.ecfAutenticado(rnc, environment);

      const transformer = new Transformer();
      const xml = transformer.json2xml(approvalData);

      const { signedXml } = await this.signXml(xml, 'ACECF', rnc);

      const response: any = await ecf.sendCommercialApproval(signedXml, fileName);

      logger.info(`Approval sent successfully - TrackID: ${response?.trackId || 'unknown'}`);

      return {
        ...response,
        signedXml,
      };
    } catch (error: any) {
      logger.error('Error sending approval:', error);
      throw new AppError(`Error sending approval: ${error.message}`, 500);
    }
  }

  async voidSequence(voidData: any, fileName: string, rnc?: string, environment?: string): Promise<any> {
    try {
      logger.info(`Voiding e-NCF sequence - RNC: ${rnc || 'default'}, File: ${fileName}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const { ecf } = await this.ecfAutenticado(rnc, environment);

      const transformer = new Transformer();
      const xml = transformer.json2xml(voidData);

      const { signedXml } = await this.signXml(xml, 'ANECF', rnc);

      const response: any = await ecf.voidENCF(signedXml, fileName);

      logger.info(`Void sequence sent successfully - TrackID: ${response?.trackId || 'unknown'}`);

      return {
        ...response,
        signedXml,
      };
    } catch (error: any) {
      logger.error('Error voiding sequence:', error);
      throw new AppError(`Error voiding sequence: ${error.message}`, 500);
    }
  }

  /**
   * Consulta el directorio de URLs de servicio de un cliente autorizado en DGII
   * Esto permite conocer las URLs donde enviar ECFs a otros receptores
   *
   * @param rncToQuery - El RNC del cliente que quieres consultar
   * @param certRnc - RNC para cargar el certificado de autenticación (opcional, usa el por defecto)
   * @param environment - Ambiente de DGII (test, cert, prod)
   */
  async getCustomerDirectory(rncToQuery: string, certRnc?: string, environment?: string): Promise<any> {
    try {
      logger.info(`Getting customer directory for RNC: ${rncToQuery}`);

      // Usar el certificado especificado o el por defecto (no el RNC a consultar)
      const { ecf } = await this.ecfAutenticado(certRnc, environment);

      const directory = await ecf.getCustomerDirectory(rncToQuery);

      logger.info('Customer directory retrieved successfully');
      return directory;
    } catch (error: any) {
      // Mejorar el mensaje de error para casos comunes
      let errorMessage = error.message || 'Unknown error';

      // Si el error contiene HTML de DGII (404, 500, etc.)
      if (typeof error === 'string' && error.includes('<!DOCTYPE')) {
        if (error.includes('404')) {
          errorMessage = `RNC ${rncToQuery} no encontrado en el directorio de DGII. El contribuyente no está registrado como receptor de e-CF.`;
        } else {
          errorMessage = 'Error de comunicación con DGII. Intente nuevamente.';
        }
      } else if (error.response?.data) {
        // Si es un error de axios con respuesta
        const responseData = error.response.data;
        if (typeof responseData === 'string' && responseData.includes('404')) {
          errorMessage = `RNC ${rncToQuery} no encontrado en el directorio de DGII. El contribuyente no está registrado como receptor de e-CF.`;
        } else {
          errorMessage = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
        }
      }

      logger.error('Error getting customer directory:', { error: errorMessage, rnc: rncToQuery });
      throw new AppError(`Error getting customer directory: ${errorMessage}`, 500);
    }
  }

  /**
   * Procesa un ECF recibido y genera el ARECF firmado como respuesta
   * Este método se usa en el flujo Emisor-Receptor donde el receptor
   * debe responder con un ARECF firmado al recibir un ECF
   *
   * @param ecfXml - El XML del ECF recibido
   * @param rncReceptor - El RNC del receptor (nuestro RNC)
   * @param rnc - RNC para cargar el certificado (opcional)
   * @param accepted - Si se acepta o rechaza el ECF
   * @param rejectCode - Código de rechazo si aplica
   * @returns XML del ARECF firmado
   */
  /**
   * Extrae información clave del ECF XML recibido
   */
  private extractEcfInfo(ecfXml: string): any {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(ecfXml, 'text/xml');

      const getTextContent = (tagName: string): string => {
        const element = doc.getElementsByTagName(tagName)[0];
        return element?.textContent || '';
      };

      return {
        tipoeCF: getTextContent('TipoeCF'),
        eNCF: getTextContent('eNCF'),
        rncEmisor: getTextContent('RNCEmisor'),
        razonSocialEmisor: getTextContent('RazonSocialEmisor'),
        rncComprador: getTextContent('RNCComprador'),
        razonSocialComprador: getTextContent('RazonSocialComprador'),
        fechaEmision: getTextContent('FechaEmision'),
        montoTotal: getTextContent('MontoTotal'),
        totalITBIS: getTextContent('TotalITBIS'),
      };
    } catch (error) {
      logger.error('Error extracting ECF info:', error);
      return {};
    }
  }

  /**
   * Envía la información de recepción al webhook de Odoo
   */
  private async notifyOdoo(data: {
    ecfXmlReceived: string;
    arecfXmlSigned: string;
    ecfInfo: any;
    arecfStatus: string;
    arecfRejectCode?: string;
    timestamp: string;
  }): Promise<void> {
    if (!config.odooWebhookUrl) {
      logger.info('ODOO_WEBHOOK_URL not configured, skipping Odoo notification');
      return;
    }

    try {
      logger.info(`Sending reception data to Odoo: ${config.odooWebhookUrl}`);

      const response = await axios.post(config.odooWebhookUrl, data, {
        headers: {
          'Content-Type': 'application/json',
          ...(config.odooWebhookApiKey && { 'x-api-key': config.odooWebhookApiKey }),
        },
        timeout: 10000, // 10 segundos timeout
      });

      logger.info(`Odoo notification successful: ${response.status}`);
    } catch (error: any) {
      // No lanzar error, solo loguear - el proceso debe continuar
      logger.error(`Error notifying Odoo: ${error.message}`);
      if (error.response) {
        logger.error(`Odoo response: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  async processReceivedEcf(
    ecfXml: string,
    rncReceptor: string,
    rnc?: string,
    accepted: boolean = true,
    rejectCode?: NoReceivedCode
  ): Promise<{ signedArecfXml: string; arecfData: any }> {
    try {
      logger.info(`Processing received ECF for receptor RNC: ${rncReceptor}`);

      // Extraer información del ECF recibido
      const ecfInfo = this.extractEcfInfo(ecfXml);
      logger.info(`ECF Info: eNCF=${ecfInfo.eNCF}, RNCEmisor=${ecfInfo.rncEmisor}`);

      // Determinar el estado del ARECF
      const status = accepted ? ReceivedStatus['e-CF Recibido'] : ReceivedStatus['e-CF No Recibido'];
      const code = accepted ? undefined : rejectCode;

      // Usar la librería dgii-ecf para generar el ARECF desde el ECF recibido
      const arecfXml = senderReceiver.getECFDataFromXML(ecfXml, rncReceptor, status, code);

      logger.info('ARECF XML generated, signing...');
      logger.debug('Generated ARECF XML:', arecfXml);

      // Firmar el ARECF con nuestro certificado
      const { signedXml } = await this.signXml(arecfXml, 'ARECF', rnc);

      logger.info('ARECF signed successfully');

      // Extraer datos del ARECF para la respuesta
      const transformer = new Transformer();
      const arecfData = transformer.xml2Json(signedXml);

      // Enviar notificación a Odoo (en background, no bloquea la respuesta)
      this.notifyOdoo({
        ecfXmlReceived: ecfXml,
        arecfXmlSigned: signedXml,
        ecfInfo,
        arecfStatus: status,
        arecfRejectCode: code,
        timestamp: new Date().toISOString(),
      }).catch(err => logger.error('Background Odoo notification failed:', err));

      return {
        signedArecfXml: signedXml,
        arecfData,
      };
    } catch (error: any) {
      logger.error('Error processing received ECF:', error);
      throw new AppError(`Error processing received ECF: ${error.message}`, 500);
    }
  }

  /**
   * Procesa una petición multipart con un ECF y retorna el ARECF firmado
   * Compatible con el estándar Emisor-Receptor de DGII
   *
   * @param body - Body de la petición (Buffer o string)
   * @param contentType - Content-Type de la petición
   * @param rncReceptor - RNC del receptor (nuestro RNC)
   * @param rnc - RNC para cargar el certificado (opcional)
   * @param isBase64Encoded - Si el body viene en base64
   */
  async processMultipartEcf(
    body: string,
    contentType: string,
    rncReceptor: string,
    rnc?: string,
    isBase64Encoded: boolean = false
  ): Promise<{ signedArecfXml: string; arecfData: any; filename: string }> {
    try {
      logger.info('Processing multipart ECF reception');

      // Parsear el multipart para extraer el XML
      const { filename, xmlContent } = await senderReceiver.parseMultipart(body, contentType, isBase64Encoded);

      logger.info(`Received ECF file: ${filename}`);

      // Procesar el ECF y generar el ARECF firmado
      const result = await this.processReceivedEcf(xmlContent, rncReceptor, rnc);

      return {
        ...result,
        filename,
      };
    } catch (error: any) {
      logger.error('Error processing multipart ECF:', error);
      throw new AppError(`Error processing multipart ECF: ${error.message}`, 500);
    }
  }

  generateQRCode(params: {
    rncEmisor: string;
    rncComprador?: string;
    encf: string;
    montoTotal: number;
    securityCode: string;
    fechaEmision?: string;
    fechaFirma?: string;
    environment?: string;
  }): string {
    try {
      logger.info(`Generating QR code for e-NCF: ${params.encf}`);

      const env = this.getEnvironment(params.environment);

      let qrCodeUrl: string;

      // Detectar si es factura de consumo (E32) para usar el dominio correcto
      const isFacturaConsumo = /E32/i.test(params.encf);

      if (isFacturaConsumo) {
        // Para facturas de consumo (FC) - usa fc.dgii.gov.do
        qrCodeUrl = generateFcQRCodeURL(
          params.rncEmisor,
          params.encf,
          params.montoTotal,
          params.securityCode,
          env
        );
      } else if (params.fechaEmision && params.fechaFirma) {
        // Para facturas electrónicas (ECF) con fechas - usa ecf.dgii.gov.do
        qrCodeUrl = generateEcfQRCodeURL(
          params.rncEmisor,
          params.rncComprador || '',
          params.encf,
          params.montoTotal.toString(),
          params.fechaEmision,
          params.fechaFirma,
          params.securityCode,
          env
        );
      } else {
        // Para otros ECF sin fechas explícitas - usa ecf.dgii.gov.do
        qrCodeUrl = generateEcfQRCodeURL(
          params.rncEmisor,
          params.rncComprador || '',
          params.encf,
          params.montoTotal.toString(),
          new Date().toISOString().split('T')[0],
          new Date().toISOString(),
          params.securityCode,
          env
        );
      }

      logger.info('QR code generated successfully');
      return qrCodeUrl;
    } catch (error: any) {
      logger.error('Error generating QR code:', error);
      throw new AppError(`Error generating QR code: ${error.message}`, 500);
    }
  }

  /**
   * Genera el XML de ACECF (Aprobación Comercial de e-CF)
   * Se usa para aprobar o rechazar comercialmente un ECF recibido
   *
   * @param data - Datos de la aprobación comercial
   * @returns XML del ACECF generado
   */
  generateAcecfXml(data: {
    rncEmisor: string;
    eNCF: string;
    fechaEmision: string;
    montoTotal: number;
    rncComprador: string;
    estado: '1' | '2'; // 1=Aprobado Comercialmente, 2=Rechazado Comercialmente
    detalleMotivoRechazo?: string;
  }): string {
    try {
      logger.info(`Generating ACECF XML for e-NCF: ${data.eNCF}, Estado: ${data.estado}`);

      const transformer = new Transformer();

      // Formatear fecha actual para FechaHoraAprobacionComercial (DD-MM-YYYY HH:mm:ss)
      const now = new Date();
      const fechaHora = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      const acecfData = {
        ACECF: {
          _attributes: {
            'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            'xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
          },
          DetalleAprobacionComercial: {
            Version: '1.0',
            RNCEmisor: data.rncEmisor,
            eNCF: data.eNCF,
            FechaEmision: data.fechaEmision, // Formato DD-MM-YYYY
            MontoTotal: data.montoTotal.toString(),
            RNCComprador: data.rncComprador,
            Estado: data.estado,
            ...(data.estado === '2' && data.detalleMotivoRechazo && {
              DetalleMotivoRechazo: data.detalleMotivoRechazo,
            }),
            FechaHoraAprobacionComercial: fechaHora,
          },
        },
      };

      const xml = transformer.json2xml(acecfData);

      logger.info('ACECF XML generated successfully');
      return xml;
    } catch (error: any) {
      logger.error('Error generating ACECF XML:', error);
      throw new AppError(`Error generating ACECF XML: ${error.message}`, 500);
    }
  }

  /**
   * Genera, firma y envía un ACECF (Aprobación Comercial) a DGII
   *
   * @param data - Datos de la aprobación comercial
   * @param rnc - RNC para cargar el certificado
   * @param environment - Ambiente DGII
   * @returns Respuesta de DGII
   */
  async sendCommercialApproval(
    data: {
      rncEmisor: string;
      eNCF: string;
      fechaEmision: string;
      montoTotal: number;
      rncComprador: string;
      estado: '1' | '2';
      detalleMotivoRechazo?: string;
    },
    rnc?: string,
    environment?: string
  ): Promise<any> {
    try {
      logger.info(`Sending commercial approval (ACECF) for e-NCF: ${data.eNCF}`);

      // Generar el XML del ACECF
      const acecfXml = this.generateAcecfXml(data);

      // Firmar el XML
      const { signedXml } = await this.signXml(acecfXml, 'ACECF', rnc);

      logger.info('ACECF signed, sending to DGII...');

      // Enviar a DGII
      const { ecf } = await this.ecfAutenticado(rnc, environment);

      // Nombre del archivo: ACECF_RNCComprador_eNCF.xml
      const fileName = `ACECF_${data.rncComprador}_${data.eNCF}.xml`;

      const response = await ecf.sendCommercialApproval(signedXml, fileName);

      logger.info('Commercial approval sent successfully');

      return {
        success: true,
        response,
        signedXml,
        fileName,
      };
    } catch (error: any) {
      logger.error('Error sending commercial approval:', error);
      throw new AppError(`Error sending commercial approval: ${error.message}`, 500);
    }
  }

  /**
   * Procesa un ECF recibido y genera/envía el ACECF de aprobación o rechazo comercial
   * Este es un método de conveniencia que combina la generación y envío del ACECF
   *
   * @param ecfXml - XML del ECF recibido (para extraer los datos necesarios)
   * @param estado - 1=Aprobado, 2=Rechazado
   * @param motivoRechazo - Motivo del rechazo (requerido si estado=2)
   * @param rnc - RNC para cargar el certificado
   * @param environment - Ambiente DGII
   */
  async processCommercialApproval(
    ecfXml: string,
    estado: '1' | '2',
    motivoRechazo?: string,
    rnc?: string,
    environment?: string
  ): Promise<any> {
    try {
      logger.info(`Processing commercial approval from received ECF, Estado: ${estado}`);

      // Extraer información del ECF
      const ecfInfo = this.extractEcfInfo(ecfXml);

      if (!ecfInfo.eNCF || !ecfInfo.rncEmisor || !ecfInfo.rncComprador) {
        throw new AppError('Invalid ECF: missing required fields (eNCF, RNCEmisor, or RNCComprador)', 400);
      }

      // Formatear la fecha de emisión al formato DD-MM-YYYY
      let fechaEmision = ecfInfo.fechaEmision;
      if (fechaEmision && fechaEmision.includes('-') && fechaEmision.length === 10) {
        // Si viene en formato YYYY-MM-DD, convertir a DD-MM-YYYY
        const parts = fechaEmision.split('-');
        if (parts[0].length === 4) {
          fechaEmision = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }

      const result = await this.sendCommercialApproval(
        {
          rncEmisor: ecfInfo.rncEmisor,
          eNCF: ecfInfo.eNCF,
          fechaEmision: fechaEmision,
          montoTotal: parseFloat(ecfInfo.montoTotal) || 0,
          rncComprador: ecfInfo.rncComprador,
          estado,
          detalleMotivoRechazo: motivoRechazo,
        },
        rnc,
        environment
      );

      return {
        ...result,
        ecfInfo,
      };
    } catch (error: any) {
      logger.error('Error processing commercial approval:', error);
      throw new AppError(`Error processing commercial approval: ${error.message}`, 500);
    }
  }

  /**
   * Genera una semilla (seed) para autenticación Emisor-Receptor
   * El emisor debe firmar esta semilla y enviarla a /fe/autenticacion/api/validacioncertificado
   *
   * @param rnc - RNC para cargar el certificado (opcional)
   * @returns XML de la semilla
   */
  generateSeed(rnc?: string): string {
    try {
      logger.info('Generating authentication seed');

      const certs = certificateService.getCertificate(rnc);
      const customAuth = new CustomAuthentication(certs);

      const seedXml = customAuth.generateSeed();

      logger.info('Authentication seed generated successfully');
      return seedXml;
    } catch (error: any) {
      logger.error('Error generating seed:', error);
      throw new AppError(`Error generating seed: ${error.message}`, 500);
    }
  }

  /**
   * Valida una semilla firmada y genera un token de autenticación
   * Este método se usa cuando un emisor envía su semilla firmada para autenticarse
   *
   * @param signedSeedXml - XML de la semilla firmada por el emisor
   * @param rnc - RNC para cargar el certificado (opcional)
   * @returns Token de autenticación
   */
  async validateSignedSeed(signedSeedXml: string, rnc?: string): Promise<string> {
    try {
      logger.info('Validating signed seed');

      const certs = certificateService.getCertificate(rnc);
      const customAuth = new CustomAuthentication(certs);

      const token = await customAuth.verifySignedSeed(signedSeedXml);

      logger.info('Signed seed validated successfully, token generated');
      return token;
    } catch (error: any) {
      logger.error('Error validating signed seed:', error);
      throw new AppError(`Error validating signed seed: ${error.message}`, 500);
    }
  }
}

export default new DGIIService();
