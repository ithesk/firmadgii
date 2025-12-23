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
 * /api/invoice/sign-file:
 *   post:
 *     summary: Firmar archivo XML y descargarlo
 *     description: |
 *       Recibe un archivo XML sin firmar y devuelve el XML firmado listo para descargar.
 *
 *       **Uso desde interfaz web o curl:**
 *       - Enviar el XML como body raw
 *       - El XML firmado se devuelve directamente como archivo para descarga
 *
 *       **Detección automática del tipo de documento:**
 *       - Si NO se especifica `documentType`, el sistema detecta automáticamente el elemento raíz del XML
 *       - Soporta cualquier tipo de documento XML (ECF, ARECF, DeclaracionJurada, etc.)
 *
 *       **Parámetros de query:**
 *       - `documentType`: (Opcional) Tipo de documento. Si se omite, se detecta automáticamente del XML
 *       - `download`: Si es "false", devuelve XML sin forzar descarga. Default: true
 *       - `rnc`: RNC para cargar el certificado (opcional)
 *     tags: [Firma]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: documentType
 *         schema:
 *           type: string
 *         description: |
 *           Tipo de documento a firmar. **OPCIONAL** - Si se omite, se detecta automáticamente del XML.
 *           Ejemplos: ECF, ARECF, ACECF, RFCE, ANECF, DeclaracionJurada, etc.
 *       - in: query
 *         name: download
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "true"
 *         description: Si es true, fuerza la descarga del archivo
 *       - in: query
 *         name: rnc
 *         schema:
 *           type: string
 *         description: RNC para cargar el certificado
 *     requestBody:
 *       required: true
 *       content:
 *         application/xml:
 *           schema:
 *             type: string
 *             description: XML sin firmar
 *         text/xml:
 *           schema:
 *             type: string
 *             description: XML sin firmar
 *     responses:
 *       200:
 *         description: XML firmado
 *         content:
 *           application/xml:
 *             schema:
 *               type: string
 *               description: XML firmado con la firma digital
 *       400:
 *         description: XML inválido
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
import express from 'express';
router.post('/sign-file', express.raw({ type: ['application/xml', 'text/xml', '*/*'], limit: '10mb' }), invoiceController.signXmlFile);

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
 * /api/invoice/send-summary-with-ecf:
 *   post:
 *     summary: Enviar Resumen con ECF Firmado
 *     description: |
 *       Firma un ECF completo (con DetallesItems) para guardar localmente,
 *       luego convierte a RFCE y envía el resumen a DGII.
 *
 *       Ideal para facturas de consumo (tipo 32) menores a RD$250,000 donde
 *       se necesita mantener el ECF completo firmado para archivo local.
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
 *                 description: Datos de la factura en formato ECF completo (con DetallesItems)
 *               rnc:
 *                 type: string
 *                 example: "130939616"
 *               encf:
 *                 type: string
 *                 example: "E320000000001"
 *               environment:
 *                 type: string
 *                 enum: [test, cert, prod]
 *                 example: "cert"
 *     responses:
 *       200:
 *         description: Resumen enviado y ECF firmado exitosamente
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
 *                       description: ID de seguimiento de DGII
 *                     signedEcfXml:
 *                       type: string
 *                       description: XML del ECF completo firmado (para guardar localmente)
 *                     signedRfceXml:
 *                       type: string
 *                       description: XML del RFCE firmado (enviado a DGII)
 *                     ecfSecurityCode:
 *                       type: string
 *                       description: Código de seguridad del ECF
 *                     rfceSecurityCode:
 *                       type: string
 *                       description: Código de seguridad del RFCE
 *                     qrCodeUrl:
 *                       type: string
 *                       description: URL del código QR
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
router.post('/send-summary-with-ecf', invoiceController.sendSummaryWithEcf);

/**
 * @swagger
 * /api/invoice/receipt:
 *   post:
 *     summary: Enviar Acuse de Recibo (ARECF)
 *     description: |
 *       Firma y envía un Acuse de Recibo de e-CF (ARECF) a DGII.
 *
 *       El ARECF es el documento que confirma la recepción técnica de un e-CF.
 *       - Estado 0: e-CF Recibido conforme
 *       - Estado 1: e-CF No Recibido (con código de motivo)
 *
 *       El nombre del archivo se genera automáticamente: RNCComprador + eNCF + .xml
 *     tags: [Recepción]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiptData
 *             properties:
 *               receiptData:
 *                 type: object
 *                 description: Datos del acuse de recibo en formato DGII
 *                 example:
 *                   ARECF:
 *                     DetalleAcusedeRecibo:
 *                       Version: "1.0"
 *                       RNCEmisor: "131880600"
 *                       RNCComprador: "132880600"
 *                       eNCF: "E310000000001"
 *                       Estado: 0
 *                       FechaHoraAcuseRecibo: "17-12-2020 11:19:06"
 *               rnc:
 *                 type: string
 *                 description: RNC del receptor (tu empresa, para cargar el certificado)
 *                 example: "132880600"
 *               environment:
 *                 type: string
 *                 enum: [test, cert, prod]
 *                 example: "cert"
 *     responses:
 *       200:
 *         description: Acuse de recibo enviado exitosamente a DGII
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
 *                       description: ID de seguimiento de DGII
 *                     signedXml:
 *                       type: string
 *                       description: XML del ARECF firmado
 *                     fileName:
 *                       type: string
 *                       description: Nombre del archivo enviado
 *                       example: "132880600E310000000001.xml"
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
router.post('/receipt', invoiceController.sendReceipt);

/**
 * @swagger
 * /api/invoice/approval:
 *   post:
 *     summary: Enviar Aprobación Comercial (ACECF)
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

/**
 * @swagger
 * /api/invoice/receive-ecf:
 *   post:
 *     summary: Recibir ECF y responder con ARECF (Estándar Emisor-Receptor)
 *     description: |
 *       Endpoint receptor para el estándar de comunicación Emisor-Receptor de DGII.
 *
 *       Este endpoint recibe un ECF (Factura Electrónica) de un emisor (o de DGII en certificación)
 *       y responde **directamente** con el ARECF firmado como respuesta HTTP.
 *
 *       **Flujo:**
 *       1. El emisor envía el ECF firmado a este endpoint
 *       2. El sistema genera el ARECF con Estado "0" (Recibido) o "1" (No Recibido)
 *       3. El ARECF se firma con el certificado del receptor
 *       4. Se responde con el XML del ARECF firmado (Content-Type: application/xml)
 *
 *       **Soporta múltiples formatos de entrada:**
 *       - `multipart/form-data`: Estándar DGII con el XML como archivo adjunto
 *       - `application/json`: JSON con campo `ecfXml` conteniendo el XML
 *       - `application/xml` o `text/xml`: XML directo del ECF
 *
 *       **Uso en certificación DGII:**
 *       En el proceso de certificación, DGII actúa como emisor y envía ECFs de prueba.
 *       Este endpoint debe estar expuesto públicamente y registrado en el directorio de DGII.
 *     tags: [Recepción]
 *     parameters:
 *       - in: query
 *         name: rncReceptor
 *         required: true
 *         schema:
 *           type: string
 *         description: RNC del receptor (tu empresa)
 *         example: "132493788"
 *       - in: query
 *         name: rnc
 *         schema:
 *           type: string
 *         description: RNC para cargar el certificado (opcional, usa rncReceptor si no se especifica)
 *       - in: query
 *         name: accepted
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           default: "true"
 *         description: Si el ECF es aceptado o rechazado
 *       - in: query
 *         name: rejectCode
 *         schema:
 *           type: string
 *           enum: ["1", "2", "3", "4"]
 *         description: |
 *           Código de rechazo si accepted=false:
 *           - 1: Error de especificación
 *           - 2: Error de Firma Digital
 *           - 3: Envío duplicado
 *           - 4: RNC Comprador no corresponde
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               xml:
 *                 type: string
 *                 format: binary
 *                 description: Archivo XML del ECF firmado
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ecfXml
 *             properties:
 *               ecfXml:
 *                 type: string
 *                 description: XML del ECF firmado
 *         application/xml:
 *           schema:
 *             type: string
 *             description: XML del ECF firmado
 *     responses:
 *       200:
 *         description: ARECF firmado como respuesta
 *         content:
 *           application/xml:
 *             schema:
 *               type: string
 *               description: XML del ARECF firmado
 *               example: |
 *                 <?xml version="1.0"?>
 *                 <ARECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 *                   <DetalleAcusedeRecibo>
 *                     <Version>1.0</Version>
 *                     <RNCEmisor>131880600</RNCEmisor>
 *                     <RNCComprador>132493788</RNCComprador>
 *                     <eNCF>E310000000001</eNCF>
 *                     <Estado>0</Estado>
 *                     <FechaHoraAcuseRecibo>22-12-2025 10:30:00</FechaHoraAcuseRecibo>
 *                   </DetalleAcusedeRecibo>
 *                   <Signature>...</Signature>
 *                 </ARECF>
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
router.post('/receive-ecf', invoiceController.receiveEcf);

/**
 * @swagger
 * /api/invoice/receive-ecf-json:
 *   post:
 *     summary: Recibir ECF y obtener ARECF en JSON
 *     description: |
 *       Endpoint alternativo para recibir un ECF y obtener el ARECF en formato JSON.
 *       Útil para depuración o integración con sistemas que prefieren JSON.
 *
 *       A diferencia de `/receive-ecf`, este endpoint devuelve JSON con el ARECF
 *       firmado y los datos parseados.
 *     tags: [Recepción]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ecfXml
 *               - rncReceptor
 *             properties:
 *               ecfXml:
 *                 type: string
 *                 description: XML del ECF firmado recibido
 *               rncReceptor:
 *                 type: string
 *                 description: RNC del receptor (tu empresa)
 *                 example: "132493788"
 *               rnc:
 *                 type: string
 *                 description: RNC para cargar el certificado
 *               accepted:
 *                 type: boolean
 *                 default: true
 *                 description: Si el ECF es aceptado
 *               rejectCode:
 *                 type: string
 *                 description: Código de rechazo si accepted=false
 *     responses:
 *       200:
 *         description: ARECF generado exitosamente
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
 *                     signedArecfXml:
 *                       type: string
 *                       description: XML del ARECF firmado
 *                     arecfData:
 *                       type: object
 *                       description: Datos del ARECF parseados
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
router.post('/receive-ecf-json', invoiceController.receiveEcfJson);

/**
 * @swagger
 * /api/invoice/acecf:
 *   post:
 *     summary: Enviar Aprobación Comercial (ACECF) a DGII
 *     description: |
 *       Envía una Aprobación Comercial de e-CF (ACECF) a DGII.
 *
 *       El ACECF se usa para indicar si un ECF recibido fue aprobado o rechazado
 *       comercialmente por el receptor.
 *
 *       **Estados del ACECF:**
 *       - `1`: Aprobado Comercialmente - El ECF fue aceptado
 *       - `2`: Rechazado Comercialmente - El ECF fue rechazado (requiere motivo)
 *
 *       **Flujo típico:**
 *       1. Receptor recibe ECF y envía ARECF (acuse de recibo técnico)
 *       2. Receptor revisa el ECF y decide si lo aprueba comercialmente
 *       3. Receptor envía ACECF con la decisión a DGII
 *     tags: [Aprobación Comercial]
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
 *               - eNCF
 *               - fechaEmision
 *               - montoTotal
 *               - rncComprador
 *               - estado
 *             properties:
 *               rncEmisor:
 *                 type: string
 *                 description: RNC del emisor del ECF original
 *                 example: "131880600"
 *               eNCF:
 *                 type: string
 *                 description: Número del e-NCF del ECF original
 *                 example: "E310000000001"
 *               fechaEmision:
 *                 type: string
 *                 description: Fecha de emisión del ECF original (formato DD-MM-YYYY)
 *                 example: "22-12-2025"
 *               montoTotal:
 *                 type: number
 *                 description: Monto total del ECF original
 *                 example: 1180.00
 *               rncComprador:
 *                 type: string
 *                 description: RNC del comprador/receptor (tu empresa)
 *                 example: "130939616"
 *               estado:
 *                 type: string
 *                 enum: ["1", "2"]
 *                 description: |
 *                   Estado de la aprobación comercial:
 *                   - 1: Aprobado Comercialmente
 *                   - 2: Rechazado Comercialmente
 *                 example: "1"
 *               detalleMotivoRechazo:
 *                 type: string
 *                 description: Motivo del rechazo (requerido si estado="2")
 *                 example: "Productos no corresponden a la orden de compra"
 *               rnc:
 *                 type: string
 *                 description: RNC para cargar el certificado
 *               environment:
 *                 type: string
 *                 enum: ["test", "cert", "prod"]
 *                 description: Ambiente de DGII
 *     responses:
 *       200:
 *         description: ACECF enviado exitosamente
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
 *                     success:
 *                       type: boolean
 *                     response:
 *                       type: object
 *                       description: Respuesta de DGII
 *                     signedXml:
 *                       type: string
 *                       description: XML del ACECF firmado
 *                     fileName:
 *                       type: string
 *                       description: Nombre del archivo enviado
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
router.post('/acecf', invoiceController.sendAcecf);

/**
 * @swagger
 * /api/invoice/acecf/from-ecf:
 *   post:
 *     summary: Procesar ACECF desde ECF XML recibido
 *     description: |
 *       Extrae automáticamente los datos del ECF XML recibido y envía el ACECF a DGII.
 *
 *       Este endpoint es útil cuando tienes el XML del ECF original y quieres
 *       enviar la aprobación comercial sin tener que extraer manualmente los datos.
 *
 *       **El sistema extrae automáticamente:**
 *       - RNC del emisor
 *       - e-NCF
 *       - Fecha de emisión
 *       - Monto total
 *       - RNC del comprador
 *     tags: [Aprobación Comercial]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ecfXml
 *               - estado
 *             properties:
 *               ecfXml:
 *                 type: string
 *                 description: XML del ECF recibido
 *               estado:
 *                 type: string
 *                 enum: ["1", "2"]
 *                 description: |
 *                   Estado de la aprobación comercial:
 *                   - 1: Aprobado Comercialmente
 *                   - 2: Rechazado Comercialmente
 *                 example: "1"
 *               motivoRechazo:
 *                 type: string
 *                 description: Motivo del rechazo (requerido si estado="2")
 *               rnc:
 *                 type: string
 *                 description: RNC para cargar el certificado
 *               environment:
 *                 type: string
 *                 enum: ["test", "cert", "prod"]
 *                 description: Ambiente de DGII
 *     responses:
 *       200:
 *         description: ACECF procesado y enviado exitosamente
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
 *                     success:
 *                       type: boolean
 *                     response:
 *                       type: object
 *                       description: Respuesta de DGII
 *                     signedXml:
 *                       type: string
 *                       description: XML del ACECF firmado
 *                     fileName:
 *                       type: string
 *                     ecfInfo:
 *                       type: object
 *                       description: Datos extraídos del ECF
 *                       properties:
 *                         tipoeCF:
 *                           type: string
 *                         eNCF:
 *                           type: string
 *                         rncEmisor:
 *                           type: string
 *                         razonSocialEmisor:
 *                           type: string
 *                         rncComprador:
 *                           type: string
 *                         montoTotal:
 *                           type: string
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
router.post('/acecf/from-ecf', invoiceController.processAcecfFromEcf);

export default router;
