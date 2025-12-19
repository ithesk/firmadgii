import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  certificatePath: string;
  certificatePassword: string;
  dgiiEnvironment: 'test' | 'cert' | 'prod';
  apiKey: string;
  logLevel: string;
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  certificatePath: process.env.CERTIFICATE_PATH || path.join(__dirname, '../../certificates/certificado.p12'),
  certificatePassword: process.env.CERTIFICATE_PASSWORD || '',
  dgiiEnvironment: (process.env.DGII_ENVIRONMENT as 'test' | 'cert' | 'prod') || 'test',
  apiKey: process.env.API_KEY || 'development_api_key',
  logLevel: process.env.LOG_LEVEL || 'info',
};

export default config;
