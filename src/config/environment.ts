import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  certificatePath: string;
  certificatePassword: string;
  certificateBase64: string;
  dgiiEnvironment: 'test' | 'cert' | 'prod';
  apiKey: string;
  logLevel: string;
  rncReceptor: string; // RNC del receptor para el endpoint Emisor-Receptor
  odooWebhookUrl: string; // URL del endpoint de Odoo para notificar recepciones
  odooWebhookApiKey: string; // API Key para autenticar con Odoo
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  certificatePath: process.env.CERTIFICATE_PATH || path.join(__dirname, '../../certificates/certificado.p12'),
  certificatePassword: process.env.CERTIFICATE_PASSWORD || '',
  certificateBase64: process.env.CERTIFICATE_BASE64 || '',
  dgiiEnvironment: (process.env.DGII_ENVIRONMENT as 'test' | 'cert' | 'prod') || 'test',
  apiKey: process.env.API_KEY || 'development_api_key',
  logLevel: process.env.LOG_LEVEL || 'info',
  rncReceptor: process.env.RNC_RECEPTOR || '', // RNC del receptor para endpoint DGII
  odooWebhookUrl: process.env.ODOO_WEBHOOK_URL || '', // URL del endpoint de Odoo
  odooWebhookApiKey: process.env.ODOO_WEBHOOK_API_KEY || '', // API Key para Odoo
};

export default config;
