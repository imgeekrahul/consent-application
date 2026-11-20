import express, { Router } from 'express';
import { loadAuthorizedDocument } from '../middleware/documentAccess.js';
import { publicDocumentLimiter, signLimiter } from '../middleware/rateLimiters.js';
import { getDocumentMetadata, getOriginalPdf, getSignedPdf, signDocument } from '../controllers/documentController.js';

const router = Router();

router.use(publicDocumentLimiter);
router.get('/:id', loadAuthorizedDocument, getDocumentMetadata);
router.get('/:id/pdf', loadAuthorizedDocument, getOriginalPdf);
router.get('/:id/signed-pdf', loadAuthorizedDocument, getSignedPdf);
router.post('/:id/sign', signLimiter, express.json({ limit: '4mb' }), loadAuthorizedDocument, signDocument);

export default router;
