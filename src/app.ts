import { empresas } from './config/empresas';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import config from './config/environment';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import logger from './utils/logger';
import { receiveEcf, receiveAcecf, getSeed, validateCertificate } from './controllers/invoiceController';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Swagger configuration
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DGII e-CF Microservice API',
      version: '1.0.0',
      description: 'API para facturación electrónica de República Dominicana (DGII e-CF)',
      contact: {
        name: 'API Support',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
      {
        url: `https://api.example.com`,
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'API Key para autenticación',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              example: 'Error message',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
            },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI route (sin autenticación para acceso fácil)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'DGII e-CF API Docs',
}));

// Swagger JSON endpoint
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.dgiiEnvironment,
  });
});

/**
 * Endpoint Emisor-Receptor de DGII (SIN AUTENTICACIÓN)
 * Este es el endpoint que DGII llamará para enviar ECFs durante certificación
 * Path exacto requerido por el estándar: /fe/recepcion/api/ecf
 *
 * DGII envía el ECF como multipart/form-data y espera recibir el ARECF firmado como respuesta
 */
app.post('/fe/recepcion/api/ecf', express.raw({ type: '*/*', limit: '10mb' }), receiveEcf);

/**
 * Multiempresa: las mismas URLs del estándar Emisor-Receptor, con el RNC de la empresa delante.
 * Es la URL que cada empresa registra en su postulación ante la DGII, p. ej.
 *   https://ecf.miservicio.com/133524996/fe/recepcion/api/ecf
 * Solo responden los RNC dados de alta en el archivo de empresas.
 */
const empresaDeLaRuta = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (empresas.multiempresa() && !empresas.porRnc(req.params.rnc)) {
    res.status(404).json({ success: false, error: 'RNC no registrado en este servicio' });
    return;
  }
  next();
};
const RUTA_RNC = '/:rnc(\\d{9,11})';
app.post(`${RUTA_RNC}/fe/recepcion/api/ecf`, empresaDeLaRuta, express.raw({ type: '*/*', limit: '10mb' }), receiveEcf);
app.post(`${RUTA_RNC}/fe/aprobacioncomercial/api/ecf`, empresaDeLaRuta, express.raw({ type: '*/*', limit: '10mb' }), receiveAcecf);
app.get(`${RUTA_RNC}/fe/autenticacion/api/semilla`, empresaDeLaRuta, getSeed);
app.post(`${RUTA_RNC}/fe/autenticacion/api/validacioncertificado`, empresaDeLaRuta, express.raw({ type: '*/*', limit: '10mb' }), validateCertificate);

/**
 * Endpoint para recibir Aprobaciones Comerciales (ACECF) (SIN AUTENTICACIÓN)
 * Este es el endpoint que DGII o emisores llamarán para enviar sus ACECFs
 * Path: /fe/aprobacioncomercial/api/ecf
 */
app.post('/fe/aprobacioncomercial/api/ecf', express.raw({ type: '*/*', limit: '10mb' }), receiveAcecf);

/**
 * Endpoint para obtener semilla de autenticación (SIN AUTENTICACIÓN)
 * El emisor llama a este endpoint para obtener una semilla que debe firmar
 * Path: /fe/autenticacion/api/semilla
 */
app.get('/fe/autenticacion/api/semilla', getSeed);

/**
 * Endpoint para validar certificado/semilla firmada (SIN AUTENTICACIÓN)
 * El emisor envía la semilla firmada y recibe un token de autenticación
 * Path: /fe/autenticacion/api/validacioncertificado
 */
app.post('/fe/autenticacion/api/validacioncertificado', express.raw({ type: '*/*', limit: '10mb' }), validateCertificate);

app.use('/api', authenticate, routes);

app.use(errorHandler);

export default app;
