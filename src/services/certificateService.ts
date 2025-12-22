import { P12Reader } from 'dgii-ecf';
import config from '../config/environment';
import logger from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import fs from 'fs';
import path from 'path';
import { X509Certificate } from 'crypto';

export class CertificateService {
  private certificates: Map<string, any> = new Map();

  getCertificate(rnc?: string): any {
    try {
      const cacheKey = rnc || 'default';

      if (this.certificates.has(cacheKey)) {
        logger.debug(`Using cached certificate for ${cacheKey}`);
        return this.certificates.get(cacheKey);
      }

      const reader = new P12Reader(config.certificatePassword);
      let certs: any;

      // Si hay certificado en Base64, usarlo primero (para cloud deployments)
      if (config.certificateBase64 && !rnc) {
        logger.info('Loading certificate from Base64');
        certs = reader.getKeyFromStringBase64(config.certificateBase64);
      } else {
        // Cargar desde archivo
        const certificatePath = rnc
          ? path.join(path.dirname(config.certificatePath), `${rnc}.p12`)
          : config.certificatePath;

        if (!fs.existsSync(certificatePath)) {
          throw new AppError(`Certificate not found for RNC: ${rnc || 'default'}`, 404);
        }

        logger.info(`Loading certificate from ${certificatePath}`);
        certs = reader.getKeyFromFile(certificatePath);
      }

      this.certificates.set(cacheKey, certs);
      logger.info(`Certificate loaded successfully for ${cacheKey}`);

      return certs;
    } catch (error: any) {
      logger.error('Error loading certificate:', error);
      throw new AppError(`Error loading certificate: ${error.message}`, 500);
    }
  }

  getCertificateInfo(rnc?: string): any {
    try {
      const certs = this.getCertificate(rnc);

      // certs.cert es un string PEM, necesitamos parsearlo con X509Certificate
      const x509 = new X509Certificate(certs.cert);

      return {
        subject: x509.subject,
        issuer: x509.issuer,
        validFrom: x509.validFrom,
        validTo: x509.validTo,
        serialNumber: x509.serialNumber,
        fingerprint: x509.fingerprint256,
      };
    } catch (error: any) {
      throw new AppError(`Error getting certificate info: ${error.message}`, 500);
    }
  }

  clearCache(rnc?: string): void {
    if (rnc) {
      this.certificates.delete(rnc);
    } else {
      this.certificates.clear();
    }
    logger.info('Certificate cache cleared');
  }
}

export default new CertificateService();
