import { Router } from 'express';
import authRoutes from './authRoutes';
import invoiceRoutes from './invoiceRoutes';
import certificateRoutes from './certificateRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/invoice', invoiceRoutes);
router.use('/certificate', certificateRoutes);

export default router;
