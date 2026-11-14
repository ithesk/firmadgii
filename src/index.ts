import app from './app';
import config from './config/environment';
import logger from './utils/logger';
import fs from 'fs';
import path from 'path';
import { vigilarFila } from './services/fila';
import { sonda } from './services/sonda';

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const certificatesDir = path.join(__dirname, '../certificates');
if (!fs.existsSync(certificatesDir)) {
  fs.mkdirSync(certificatesDir, { recursive: true });
  logger.warn('Certificates directory created. Please add your .p12 certificate files.');
}

const server = app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`DGII Environment: ${config.dgiiEnvironment}`);
  logger.info(`Health check available at: http://localhost:${config.port}/health`);
});

// Guardián de la fila de la DGII y sonda de disponibilidad
vigilarFila();
sonda.iniciar();

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});

export default server;
