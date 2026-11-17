import { Router } from 'express';
import authRoutes from './authRoutes';
import invoiceRoutes from './invoiceRoutes';
import certificateRoutes from './certificateRoutes';
import { listarBandeja, confirmarBandeja } from '../controllers/invoiceController';
import {
  soloAdmin, resumen, actividadEmpresa, vaciarFila, reiniciar, probarEmpresa, documentosEmpresa, consultarDocumento,
  altaEmpresa, cambiarEmpresa, nuevaClaveEmpresa, subirCertificado, listarCuarentena, leerCuarentena,
} from '../controllers/adminController';
import { anotarActividad } from '../services/actividad';

const router = Router();

router.use('/auth', authRoutes);
router.use('/invoice', anotarActividad, invoiceRoutes);
router.use('/certificate', certificateRoutes);
// Bandeja de recibidos (e-CF de proveedores, aprobaciones comerciales) que Odoo recoge con su clave
router.get('/inbox', listarBandeja);
router.post('/inbox/ack', confirmarBandeja);

// Administración: exige la clave de administración; cada acción queda en la auditoría
router.get('/admin/resumen', soloAdmin, resumen);
router.get('/admin/cuarentena', soloAdmin, listarCuarentena);
router.get('/admin/cuarentena/:id', soloAdmin, leerCuarentena);
router.get('/admin/actividad/:rnc', soloAdmin, actividadEmpresa);
router.post('/admin/fila/vaciar', soloAdmin, vaciarFila);
router.post('/admin/reiniciar', soloAdmin, reiniciar);
router.post('/admin/empresas', soloAdmin, altaEmpresa);
router.patch('/admin/empresas/:rnc', soloAdmin, cambiarEmpresa);
router.post('/admin/empresas/:rnc/probar', soloAdmin, probarEmpresa);
router.get('/admin/empresas/:rnc/documentos', soloAdmin, documentosEmpresa);
router.post('/admin/empresas/:rnc/consultar', soloAdmin, consultarDocumento);
router.post('/admin/empresas/:rnc/clave', soloAdmin, nuevaClaveEmpresa);
router.post('/admin/empresas/:rnc/certificado', soloAdmin, subirCertificado);

export default router;
