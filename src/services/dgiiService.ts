import ECF, { ENVIRONMENT, Signature, Transformer, generateEcfQRCodeURL, getCodeSixDigitfromSignature } from 'dgii-ecf';
import config from '../config/environment';
import logger from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import certificateService from './certificateService';
import { InvoiceData } from '../types';

export class DGIIService {
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

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      const transformer = new Transformer();
      const xml = transformer.json2xml(invoiceData);

      const { signedXml, securityCode } = await this.signXml(xml, 'ECF', rnc);

      const response = await ecf.sendElectronicDocument(signedXml, `${rnc}${encf}.xml`);

      const rncComprador = invoiceData.ECF?.Encabezado?.Comprador?.RNCComprador;
      const montoTotal = invoiceData.ECF?.Encabezado?.Totales?.MontoTotal;
      const fechaEmision = invoiceData.ECF?.Encabezado?.Emisor?.FechaEmision;
      const fechaFirma = new Date().toISOString();

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
        qrCodeUrl,
      };
    } catch (error: any) {
      logger.error('Error sending invoice:', error);
      throw new AppError(`Error sending invoice: ${error.message}`, 500);
    }
  }

  async getStatus(trackId: string, rnc?: string, environment?: string): Promise<any> {
    try {
      logger.info(`Getting status for trackID: ${trackId}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      const status = await ecf.statusTrackId(trackId);

      logger.info(`Status retrieved successfully for trackID: ${trackId}`);
      return status;
    } catch (error: any) {
      logger.error('Error getting status:', error);
      throw new AppError(`Error getting status: ${error.message}`, 500);
    }
  }

  async getTracks(rnc: string, encf: string, environment?: string): Promise<any> {
    try {
      logger.info(`Getting tracks for RNC: ${rnc}, e-NCF: ${encf}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      const tracks = await ecf.trackStatuses(rnc, encf);

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

      const certs = certificateService.getCertificate(rncEmisor);
      const env = this.getEnvironment(environment);

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      const inquiry = await ecf.inquiryStatus(rncEmisor, encf, rncComprador, securityCode);

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

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

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
      throw new AppError(`Error sending summary: ${error.message}`, 500);
    }
  }

  async sendSummaryWithEcf(ecfData: InvoiceData, rnc: string, encf: string, environment?: string): Promise<any> {
    try {
      logger.info(`Sending summary with ECF - RNC: ${rnc}, e-NCF: ${encf}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      const transformer = new Transformer();

      // 1. Firmar ECF completo (con DetallesItems) para guardar localmente
      const ecfXml = transformer.json2xml(ecfData);
      const { signedXml: signedEcfXml, securityCode: ecfSecurityCode } = await this.signXml(ecfXml, 'ECF', rnc);

      // 2. Convertir ECF a RFCE (extraer solo Encabezado, sin DetallesItems)
      const ecfEncabezado = ecfData.ECF?.Encabezado;
      if (!ecfEncabezado) {
        throw new AppError('Invalid ECF data: missing Encabezado', 400);
      }

      const rfceData = {
        RFCE: {
          Encabezado: {
            Version: ecfEncabezado.Version || '1.0',
            IdDoc: {
              TipoeCF: 32,
              eNCF: ecfEncabezado.IdDoc?.eNCF || encf,
              TipoIngresos: ecfEncabezado.IdDoc?.TipoIngresos || '01',
              TipoPago: ecfEncabezado.IdDoc?.TipoPago || 1,
            },
            Emisor: {
              RNCEmisor: ecfEncabezado.Emisor?.RNCEmisor || rnc,
              RazonSocialEmisor: ecfEncabezado.Emisor?.RazonSocialEmisor,
              FechaEmision: ecfEncabezado.Emisor?.FechaEmision,
            },
            Comprador: {
              RNCComprador: ecfEncabezado.Comprador?.RNCComprador,
              RazonSocialComprador: ecfEncabezado.Comprador?.RazonSocialComprador,
            },
            Totales: {
              MontoGravadoTotal: ecfEncabezado.Totales?.MontoGravadoTotal || 0,
              MontoGravadoI1: ecfEncabezado.Totales?.MontoGravadoI1 || 0,
              MontoExento: ecfEncabezado.Totales?.MontoExento || 0,
              TotalITBIS: ecfEncabezado.Totales?.TotalITBIS || 0,
              TotalITBIS1: ecfEncabezado.Totales?.TotalITBIS1 || 0,
              MontoTotal: ecfEncabezado.Totales?.MontoTotal || 0,
              MontoNoFacturable: ecfEncabezado.Totales?.MontoNoFacturable || 0,
              MontoPeriodo: ecfEncabezado.Totales?.MontoTotal || 0,
            },
            CodigoSeguridadeCF: ecfSecurityCode,
          },
        },
      };

      // 3. Firmar RFCE y enviar a DGII
      const rfceXml = transformer.json2xml(rfceData);
      const { signedXml: signedRfceXml, securityCode: rfceSecurityCode } = await this.signXml(rfceXml, 'RFCE', rnc);

      const response: any = await ecf.sendSummary(signedRfceXml, `${rnc}${encf}.xml`);

      logger.info(`Summary with ECF sent successfully - TrackID: ${response?.trackId || 'unknown'}`);

      // 4. Generar QR Code URL
      const qrCodeUrl = generateEcfQRCodeURL(
        rnc,
        ecfEncabezado.Comprador?.RNCComprador || '',
        encf,
        ecfEncabezado.Totales?.MontoTotal?.toString() || '0',
        ecfEncabezado.Emisor?.FechaEmision || '',
        new Date().toISOString(),
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

  async sendApproval(approvalData: any, fileName: string, rnc?: string, environment?: string): Promise<any> {
    try {
      logger.info(`Sending commercial approval - RNC: ${rnc || 'default'}, File: ${fileName}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

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

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

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

  async getCustomerDirectory(rnc: string, environment?: string): Promise<any> {
    try {
      logger.info(`Getting customer directory for RNC: ${rnc}`);

      const certs = certificateService.getCertificate(rnc);
      const env = this.getEnvironment(environment);

      const ecf = new ECF(certs, env);
      await ecf.authenticate();

      const directory = await ecf.getCustomerDirectory(rnc);

      logger.info('Customer directory retrieved successfully');
      return directory;
    } catch (error: any) {
      logger.error('Error getting customer directory:', error);
      throw new AppError(`Error getting customer directory: ${error.message}`, 500);
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

      if (params.fechaEmision && params.fechaFirma) {
        // Para facturas electrónicas (ECF)
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
        // Para facturas de consumo (FC) - usando la librería dgii-ecf
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
}

export default new DGIIService();
