import { Router } from 'express';
import * as authController from '../controllers/authController';
import { validateRequest, schemas } from '../middleware/validation';

const router = Router();

/**
 * @swagger
 * /api/auth/dgii:
 *   post:
 *     summary: Autenticar con DGII
 *     description: Obtiene un token de autenticación de la DGII para realizar operaciones posteriores
 *     tags: [Autenticación]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rnc:
 *                 type: string
 *                 description: RNC de la empresa (opcional, usa certificado default si no se provee)
 *                 example: "130862346"
 *               environment:
 *                 type: string
 *                 enum: [test, cert, prod]
 *                 description: Ambiente de DGII
 *                 example: "test"
 *     responses:
 *       200:
 *         description: Autenticación exitosa
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
 *                     token:
 *                       type: string
 *                       example: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     expiresIn:
 *                       type: number
 *                       example: 3600
 *       401:
 *         description: API Key inválida
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
router.post('/dgii', validateRequest(schemas.auth), authController.authenticate);

export default router;
