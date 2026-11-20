import config from '../config/index.js';
import store from '../services/documentStore.js';
import { generateAccessToken, generateDocumentId, isValidDocumentId, sha256 } from '../services/ids.js';
import { validatePdfUpload, sanitizeFilename } from '../services/fileValidation.js';
import { computeSignatureField } from '../services/pdfLayout.js';
import { saveOriginal, deleteFiles } from '../services/fileStorage.js';
import { HttpError } from '../middleware/errorHandler.js';
import { toAdminDocument } from './documentPresenter.js';

export async function uploadDocument(req, res) {
  const { pageCount } = await validatePdfUpload(req.file, { maxPages: config.maxPages });
  const buffer = req.file.buffer;

  let signatureField;
  try {
    signatureField = await computeSignatureField(buffer);
  } catch (err) {
    console.warn('[upload] layout analysis failed:', err.message);
    throw new HttpError(422, 'The PDF could not be rendered. Please upload a standard PDF document.');
  }

  const id = generateDocumentId();
  const storedFile = `${id}.pdf`;
  await saveOriginal(storedFile, buffer);

  const doc = await store.create({
    id,
    accessToken: generateAccessToken(),
    originalName: sanitizeFilename(req.file.originalname),
    storedFile,
    size: buffer.length,
    pageCount,
    sha256: sha256(buffer),
    status: 'pending',
    signatureField,
  });

  res.status(201).json({ document: toAdminDocument(doc, req) });
}

export async function listDocuments(req, res) {
  const docs = await store.list();
  res.json({ documents: docs.map((d) => toAdminDocument(d, req)) });
}

async function findOr404(id) {
  if (!isValidDocumentId(id)) throw new HttpError(404, 'Document not found.');
  const doc = await store.get(id);
  if (!doc) throw new HttpError(404, 'Document not found.');
  return doc;
}

export async function getDocument(req, res) {
  res.json({ document: toAdminDocument(await findOr404(req.params.id), req) });
}

export async function deleteDocument(req, res) {
  const doc = await findOr404(req.params.id);
  if (doc.status === 'processing') throw new HttpError(409, 'This document is being signed right now. Try again in a moment.');
  await store.remove(doc.id);
  await deleteFiles(doc);
  res.json({ ok: true });
}
