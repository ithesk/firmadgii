import { Router } from 'express';
import authRoutes from './authRoutes';
import invoiceRoutes from './invoiceRoutes';
import certificateRoutes from './certificateRoutes';
import { listarBandeja, confirmarBandeja } from '../controllers/invoiceController';

const router = Router();

router.use('/auth', authRoutes);
router.use('/invoice', invoiceRoutes);
router.use('/certificate', certificateRoutes);
// Bandeja de recibidos (e-CF de proveedores, aprobaciones comerciales) que Odoo recoge con su clave
router.get('/inbox', listarBandeja);
router.post('/inbox/ack', confirmarBandeja);

export default router;
