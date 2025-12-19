import { Router } from 'express';
import * as invoiceController from '../controllers/invoiceController';
import { validateRequest, schemas } from '../middleware/validation';

const router = Router();

/**
 * @swagger
 * /api/invoice/sign:
 *   post:
 *     summary: Firmar XML
 *     description: Firma un documento XML sin enviarlo a DGII
 *     tags: [Facturas]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - xmlData
 *               - documentType
 *             properties:
 *               xmlData:
 *                 type: string
 *                 description: XML sin firmar
 *                 example: "<ECF>...</ECF>"
 *               documentType:
 *                 type: string
 *                 enum: [ECF, ACECF, ANECF, RFCE, ARECF]
 *                 description: Tipo de documento
 *                 example: "ECF"
 *               rnc:
 *                 type: string
 *                 description: RNC de la empresa (opcional)
 *                 example: "130862346"
 *     responses:
 *       200:
 *         description: XML firmado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     signedXml:
 *                       type: string
 *                       example: "<ECF>...<Signature>...</Signature></ECF>"
 *                     securityCode:
 *                       type: string
 *                       example: "ABC123"
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/sign', validateRequest(schemas.signXml), invoiceController.signXml);

/**
 * @swagger
 * /api/invoice/send:
 *   post:
 *     summary: Enviar Factura
 *     description: Convierte JSON a XML, firma y envía factura electrónica a DGII
 *     tags: [Facturas]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invoiceData
 *               - rnc
 *               - encf
 *             properties:
 *               invoiceData:
 *                 type: object
 *                 description: Datos de la factura en formato JSON DGII
 *               rnc:
 *                 type: string
 *                 description: RNC del emisor
 *                 example: "130862346"
 *               encf:
 *                 type: string
 *                 description: Número de e-NCF
 *                 example: "E310005000201"
 *               environment:
 *                 type: string
 *                 enum: [test, cert, prod]
 *                 description: Ambiente de DGII
 *                 example: "test"
 *     responses:
 *       200:
 *         description: Factura enviada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     trackId:
 *                       type: string
 *                       example: "d2b6e27c-3908-46f3-afaa-2207b9501b4b"
 *                     codigo:
 *                       type: string
 *                       example: "1"
 *                     estado:
 *                       type: string
 *                       example: "Aceptado"
 *                     rnc:
 *                       type: string
 *                       example: "130862346"
 *                     encf:
 *                       type: string
 *                       example: "E310005000201"
 *                     fechaRecepcion:
 *                       type: string
 *                       example: "9/12/2025 5:06:57 PM"
 *                     signedXml:
 *                       type: string
 *                     securityCode:
 *                       type: string
 *                       example: "ABC123"
 *                     qrCodeUrl:
 *                       type: string
 *                       example: "https://dgii.gov.do/ecf/qr?..."
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/send', validateRequest(schemas.sendInvoice), invoiceController.sendInvoice);

/**
 * @swagger
 * /api/invoice/status/{trackId}:
 *   get:
 *     summary: Consultar Estado por TrackID
 *     description: Obtiene el estado actual de un documento enviado a DGII usando su trackID
 *     tags: [Consultas]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: trackId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de seguimiento del documento
 *         example: "d2b6e27c-3908-46f3-afaa-2207b9501b4b"
 *     responses:
 *       200:
 *         description: Estado obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     trackId:
 *                       type: string
 *                       example: "d2b6e27c-3908-46f3-afaa-2207b9501b4b"
 *                     codigo:
 *                       type: string
 *                       example: "1"
 *                     estado:
 *                       type: string
 *                       example: "Aceptado"
 *                     rnc:
 *                       type: string
 *                       example: "130862346"
 *                     encf:
 *                       type: string
 *                       example: "E310005000201"
 *                     secuenciaUtilizada:
 *                       type: boolean
 *                       example: true
 *                     fechaRecepcion:
 *                       type: string
 *                       example: "9/12/2025 5:06:57 PM"
 *                     mensajes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           valor:
 *                             type: string
 *                           codigo:
 *                             type: number
 *       404:
 *         description: TrackID no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/status/:trackId', invoiceController.getStatus);

/**
 * @swagger
 * /api/invoice/tracks/{rnc}/{encf}:
 *   get:
 *     summary: Consultar Tracks de un e-NCF
 *     description: Obtiene todos los trackIDs asociados a un e-NCF específico
 *     tags: [Consultas]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: rnc
 *         required: true
 *         schema:
 *           type: string
 *         description: RNC del emisor
 *         example: "130862346"
 *       - in: path
 *         name: encf
 *         required: true
 *         schema:
 *           type: string
 *         description: Número de e-NCF
 *         example: "E310005000201"
 *     responses:
 *       200:
 *         description: Tracks obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       trackId:
 *                         type: string
 *                         example: "d2b6e27c-3908-..."
 *                       fechaEnvio:
 *                         type: string
 *                         example: "9/12/2025 5:00:00 PM"
 *                       estado:
 *                         type: string
 *                         example: "Aceptado"
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/tracks/:rnc/:encf', invoiceController.getTracks);

/**
 * @swagger
 * /api/invoice/inquire:
 *   post:
 *     summary: Validar Factura
 *     description: Consulta la validez y estado de un e-CF en DGII
 *     tags: [Consultas]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rncEmisor
 *               - encf
 *             properties:
 *               rncEmisor:
 *                 type: string
 *                 description: RNC del emisor
 *                 example: "130862346"
 *               encf:
 *                 type: string
 *                 description: Número de e-NCF
 *                 example: "E310005000201"
 *               rncComprador:
 *                 type: string
 *                 description: RNC del comprador (opcional)
 *                 example: "123456789"
 *               securityCode:
 *                 type: string
 *                 description: Código de seguridad (opcional)
 *                 example: "ABC123"
 *     responses:
 *       200:
 *         description: Consulta exitosa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     valido:
 *                       type: boolean
 *                       example: true
 *                     estado:
 *                       type: string
 *                       example: "Vigente"
 *                     fechaEmision:
 *                       type: string
 *                       example: "09-12-2025"
 *                     montoTotal:
 *                       type: number
 *                       example: 11800.00
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/inquire', validateRequest(schemas.inquiry), invoiceController.inquire);

/**
 * @swagger
 * /api/invoice/send-summary:
 *   post:
 *     summary: Enviar Resumen RFCE
 *     description: Envía resumen de factura de consumo menor a RD$250,000 (RFCE)
 *     tags: [Facturas]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invoiceData
 *               - rnc
 *               - encf
 *             properties:
 *               invoiceData:
 *                 type: object
 *                 description: Datos de la factura tipo 32 (ECF de consumo)
 *               rnc:
 *                 type: string
 *                 example: "130862346"
 *               encf:
 *                 type: string
 *                 example: "E320005000201"
 *               environment:
 *                 type: string
 *                 enum: [test, cert, prod]
 *                 example: "test"
 *     responses:
 *       200:
 *         description: Resumen enviado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     trackId:
 *                       type: string
 *                     signedXml:
 *                       type: string
 *                     securityCode:
 *                       type: string
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/send-summary', invoiceController.sendSummary);

/**
 * @swagger
 * /api/invoice/approval:
 *   post:
 *     summary: Enviar Aprobación Comercial
 *     description: Envía una aprobación comercial (receptor confirma recepción de factura)
 *     tags: [Aprobaciones]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - approvalData
 *               - fileName
 *             properties:
 *               approvalData:
 *                 type: object
 *                 description: Datos de aprobación comercial en formato DGII
 *               fileName:
 *                 type: string
 *                 example: "130862346E310000000007.xml"
 *               rnc:
 *                 type: string
 *                 example: "130862346"
 *               environment:
 *                 type: string
 *                 enum: [test, cert, prod]
 *                 example: "test"
 *     responses:
 *       200:
 *         description: Aprobación enviada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     trackId:
 *                       type: string
 *                     signedXml:
 *                       type: string
 */
router.post('/approval', invoiceController.sendApproval);

/**
 * @swagger
 * /api/invoice/void:
 *   post:
 *     summary: Anular Secuencias de e-NCF
 *     description: Anula rangos de secuencias de e-NCF no utilizadas
 *     tags: [Anulaciones]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - voidData
 *               - fileName
 *             properties:
 *               voidData:
 *                 type: object
 *                 description: Datos de anulación en formato DGII
 *               fileName:
 *                 type: string
 *                 example: "130862346ANULACION.xml"
 *               rnc:
 *                 type: string
 *                 example: "130862346"
 *               environment:
 *                 type: string
 *                 enum: [test, cert, prod]
 *                 example: "test"
 *     responses:
 *       200:
 *         description: Anulación enviada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     trackId:
 *                       type: string
 *                     signedXml:
 *                       type: string
 */
router.post('/void', invoiceController.voidSequence);

/**
 * @swagger
 * /api/invoice/customer-directory/{rnc}:
 *   get:
 *     summary: Directorio de Clientes
 *     description: Obtiene el directorio de URLs de servicio de un cliente autorizado
 *     tags: [Consultas]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: rnc
 *         required: true
 *         schema:
 *           type: string
 *         description: RNC del cliente
 *         example: "123456789"
 *       - in: query
 *         name: environment
 *         schema:
 *           type: string
 *           enum: [test, cert, prod]
 *         description: Ambiente de DGII
 *         example: "test"
 *     responses:
 *       200:
 *         description: Directorio obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rnc:
 *                         type: string
 *                       urls:
 *                         type: array
 *                         items:
 *                           type: string
 */
router.get('/customer-directory/:rnc', invoiceController.getCustomerDirectory);

/**
 * @swagger
 * /api/invoice/qr/generate:
 *   get:
 *     summary: Generar Código QR
 *     description: Genera una URL de código QR para una factura electrónica
 *     tags: [Utilidades]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: rncEmisor
 *         required: true
 *         schema:
 *           type: string
 *         example: "130862346"
 *       - in: query
 *         name: encf
 *         required: true
 *         schema:
 *           type: string
 *         example: "E310005000201"
 *       - in: query
 *         name: montoTotal
 *         required: true
 *         schema:
 *           type: number
 *         example: 11800.00
 *       - in: query
 *         name: securityCode
 *         required: true
 *         schema:
 *           type: string
 *         example: "ABC123"
 *       - in: query
 *         name: rncComprador
 *         schema:
 *           type: string
 *         example: "123456789"
 *       - in: query
 *         name: fechaEmision
 *         schema:
 *           type: string
 *         example: "09-12-2025"
 *       - in: query
 *         name: fechaFirma
 *         schema:
 *           type: string
 *         example: "2025-12-09T17:30:45Z"
 *       - in: query
 *         name: environment
 *         schema:
 *           type: string
 *           enum: [test, cert, prod]
 *         example: "test"
 *     responses:
 *       200:
 *         description: QR generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     qrCodeUrl:
 *                       type: string
 *                       example: "https://dgii.gov.do/ecf/qr?data=..."
 */
router.get('/qr/generate', invoiceController.generateQR);

export default router;
