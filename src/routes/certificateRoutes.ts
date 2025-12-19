import { Router } from 'express';
import * as certificateController from '../controllers/certificateController';

const router = Router();

/**
 * @swagger
 * /api/certificate/info:
 *   get:
 *     summary: Información del Certificado
 *     description: Obtiene información del certificado digital .p12 configurado
 *     tags: [Certificado]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: rnc
 *         schema:
 *           type: string
 *         description: RNC específico (opcional, usa default si no se provee)
 *         example: "130862346"
 *     responses:
 *       200:
 *         description: Información del certificado obtenida exitosamente
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
 *                     subject:
 *                       type: string
 *                       example: "CN=EMPRESA SRL, OU=..."
 *                     issuer:
 *                       type: string
 *                       example: "CN=DIGIFIRMA CA, O=..."
 *                     validFrom:
 *                       type: string
 *                       example: "2024-01-01T00:00:00Z"
 *                     validTo:
 *                       type: string
 *                       example: "2026-01-01T00:00:00Z"
 *                     serialNumber:
 *                       type: string
 *                       example: "1234567890"
 *       401:
 *         description: API Key inválida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Certificado no encontrado
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
router.get('/info', certificateController.getCertificateInfo);

export default router;
