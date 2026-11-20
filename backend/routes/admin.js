import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { loginLimiter, uploadLimiter } from '../middleware/rateLimiters.js';
import { pdfUpload } from '../middleware/upload.js';
import { login, logout, me } from '../controllers/authController.js';
import { uploadDocument, listDocuments, getDocument, deleteDocument } from '../controllers/adminController.js';

const router = Router();

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', me);

router.use(requireAdmin);
router.post('/upload', uploadLimiter, pdfUpload, uploadDocument);
router.get('/documents', listDocuments);
router.get('/documents/:id', getDocument);
router.delete('/documents/:id', deleteDocument);

export default router;
