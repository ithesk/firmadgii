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
import path from 'path';
import { estadoServicio } from './controllers/adminController';
import { receiveEcf, receiveAcecf, getSeed, validateCertificate } from './controllers/invoiceController';
import { cuarentena } from './services/cuarentena';

const app = express();

// Detrás del proxy inverso (red privada de Docker): la dirección del cliente es la de X-Forwarded-For
app.set('trust proxy', 'uniquelocal');
app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

/**
 * Rutas públicas mal armadas por algunos emisores: a la URL registrada en la DGII le vuelven a pegar el sufijo
 * estándar, p. ej. /130939616/fe/autenticacion/fe/Autenticacion/api/Semilla (visto el 14-11-2026).
 * Si «/fe/» aparece más de una vez, se queda el RNC del principio (si lo hay) y el último «/fe/…».
 */
const RUTA_FE_REPETIDA = /^(\/\d{9,11})?\/fe\/.*(\/fe\/.+)$/i;
const esRutaPublica = (ruta: string) => /\/fe\//i.test(ruta) && !/^\/api(\/|$)/i.test(ruta);
app.use((req, res, next) => {
  const m = req.path.match(RUTA_FE_REPETIDA);
  if (m) {
    const consulta = req.url.slice(req.path.length);
    const nueva = `${m[1] || ''}${m[2]}`;
    (req as any).rutaOriginal = req.originalUrl;
    logger.warn(`Ruta pública corregida: ${req.path} → ${nueva}`, { ip: req.ip });
    req.url = nueva + consulta;
  }
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

// Salud real: 503 si la fila de la DGII no avanza. Público y sin detalle (el detalle, en /api/admin/resumen).
// `dgii` indica si la DGII responde: su caída no es un fallo del servicio y no cambia el código HTTP.
app.get('/health', (req, res) => {
  const estado = estadoServicio();
  res.status(estado.status === 'ok' ? 200 : 503).json({ ...estado, environment: config.dgiiEnvironment });
});

// Panel de administración: una página estática; los datos los pide a /api/admin/* con la clave de administración
app.get('/admin', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'");
  res.sendFile(path.join(__dirname, '../public/admin.html'));
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
    // Se guarda igual: puede ser una factura para una empresa que aún no está dada de alta
    express.raw({ type: '*/*', limit: '10mb' })(req, res, () => {
      cuarentena.guardar(req, `RNC ${req.params.rnc} no registrado en este servicio`);
      res.status(404).json({ success: false, error: 'RNC no registrado en este servicio' });
    });
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

/**
 * Cualquier otra ruta pública /fe/… que no existe: se guarda en cuarentena antes de responder 404,
 * para ver después qué era y no perder una factura por una dirección mal escrita.
 */
app.all(/\/fe\//i, (req, res, next) => {
  if (!esRutaPublica(req.path)) return next();
  express.raw({ type: '*/*', limit: '10mb' })(req, res, () => {
    cuarentena.guardar(req, 'Ruta pública desconocida');
    res.status(404).json({ success: false, error: 'Ruta no encontrada' });
  });
});

app.use('/api', authenticate, routes);

// Un fallo al procesar algo recibido por las rutas públicas tampoco se pierde
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (esRutaPublica(req.path) && req.method === 'POST') {
    cuarentena.guardar(req, `Error al procesar: ${err?.message || err}`);
  }
  next(err);
});

app.use(errorHandler);

export default app;
