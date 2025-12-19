import { P12Reader } from 'dgii-ecf';
import config from '../config/environment';
import logger from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import fs from 'fs';
import path from 'path';

export class CertificateService {
  private certificates: Map<string, any> = new Map();

  getCertificate(rnc?: string): any {
    try {
      const certificatePath = rnc
        ? path.join(path.dirname(config.certificatePath), `${rnc}.p12`)
        : config.certificatePath;

      if (!fs.existsSync(certificatePath)) {
        throw new AppError(`Certificate not found for RNC: ${rnc || 'default'}`, 404);
      }

      const cacheKey = rnc || 'default';

      if (this.certificates.has(cacheKey)) {
        logger.debug(`Using cached certificate for ${cacheKey}`);
        return this.certificates.get(cacheKey);
      }

      logger.info(`Loading certificate from ${certificatePath}`);
      const reader = new P12Reader(config.certificatePassword);
      const certs = reader.getKeyFromFile(certificatePath);

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

      return {
        subject: certs.cert.subject,
        issuer: certs.cert.issuer,
        validFrom: certs.cert.validity.notBefore,
        validTo: certs.cert.validity.notAfter,
        serialNumber: certs.cert.serialNumber,
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
