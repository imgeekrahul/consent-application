import config from '../config/index.js';
import store from '../services/documentStore.js';
import { generateTransactionId, sha256 } from '../services/ids.js';
import { parseSignatureDataUrl } from '../services/fileValidation.js';
import { createSignedPdf } from '../services/pdfSigner.js';
import { readOriginal, readSigned, saveSigned } from '../services/fileStorage.js';
import { HttpError } from '../middleware/errorHandler.js';
import { toPublicDocument } from './documentPresenter.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const SIGNATURE_TYPES = new Set(['draw', 'type', 'upload']);

export async function getDocumentMetadata(req, res) {
  if (req.accessVia === 'token') {
    store.recordView(req.document.id).catch((err) => console.warn('[view] failed to record view:', err.message));
  }
  res.json({ document: toPublicDocument(req.document) });
}

function contentDisposition(type, filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function sendPdf(res, load, filename, download) {
  let buffer;
  try {
    buffer = await load();
  } catch (err) {
    console.error('[pdf] read failed:', err.code || err.message);
    throw new HttpError(404, 'File not found.');
  }
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': String(buffer.length),
    'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', filename),
    'Cache-Control': 'private, no-store',
  });
  res.end(buffer);
}

export function getOriginalPdf(req, res) {
  const doc = req.document;
  return sendPdf(res, () => readOriginal(doc.storedFile), doc.originalName, req.query.download === '1');
}

export function getSignedPdf(req, res) {
  const doc = req.document;
  if (doc.status !== 'signed' || !doc.signing?.signedFile) {
    throw new HttpError(404, 'This document has not been signed yet.');
  }
  const name = doc.originalName.replace(/\.pdf$/i, '') + ' (signed).pdf';
  return sendPdf(res, () => readSigned(doc.signing.signedFile), name, req.query.download !== '0');
}

function validateSignRequest(body) {
  const { signerName, signerEmail, signatureType, signatureImage, consent } = body || {};
  const name = typeof signerName === 'string' ? signerName.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > 100) throw new HttpError(400, 'Please enter your full name (2–100 characters).');
  if (/[\u0000-\u001f\u007f<>]/.test(name)) throw new HttpError(400, 'Your name contains invalid characters.');

  const email = typeof signerEmail === 'string' ? signerEmail.trim() : '';
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) throw new HttpError(400, 'Please enter a valid email address.');

  if (!SIGNATURE_TYPES.has(signatureType)) throw new HttpError(400, 'Unknown signature type.');
  if (consent !== true) throw new HttpError(400, 'Please agree to sign electronically before submitting.');

  const png = parseSignatureDataUrl(signatureImage, config.maxSignatureBytes);
  return { name, email, signatureType, png };
}

export async function signDocument(req, res) {
  // Signing is only possible through the share link; an admin session can preview but not sign.
  if (req.accessVia !== 'token') throw new HttpError(403, 'Open the shared document link to sign this document.');
  const input = validateSignRequest(req.body);
  const doc = req.document;

  // Atomic lock: only one submission can move the document out of "pending".
  const locked = await store.transition(doc.id, 'pending', { status: 'processing' });
  if (!locked) {
    const current = await store.get(doc.id);
    if (current?.status === 'signed') throw new HttpError(409, 'This document has already been signed.', 'ALREADY_SIGNED');
    throw new HttpError(409, 'This document is being signed right now. Please refresh in a moment.');
  }

  try {
    const original = await readOriginal(locked.storedFile);
    if (sha256(original) !== locked.sha256) {
      throw new Error(`Integrity check failed for ${locked.id}`);
    }

    const signedAt = new Date().toISOString();
    const transactionId = generateTransactionId();
    const audit = {
      documentId: locked.id,
      documentName: locked.originalName,
      pageCount: locked.pageCount,
      originalSha256: locked.sha256,
      createdAt: locked.createdAt,
      firstViewedAt: locked.firstViewedAt,
      signerName: input.name,
      signerEmail: input.email,
      signatureType: input.signatureType,
      signedAt,
      transactionId,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    };

    const signedBytes = await createSignedPdf(original, locked, input.png, audit);
    const signedFile = `${locked.id}_signed.pdf`;
    await saveSigned(signedFile, signedBytes);

    const updated = await store.transition(locked.id, 'processing', {
      status: 'signed',
      signing: {
        signerName: input.name,
        signerEmail: input.email || undefined,
        signatureType: input.signatureType,
        signedAt,
        transactionId,
        ip: audit.ip,
        userAgent: audit.userAgent.slice(0, 500),
        signedSha256: sha256(signedBytes),
        signedSize: signedBytes.length,
        signedFile,
      },
    });
    if (!updated) throw new Error('Document disappeared while signing');
    res.status(201).json({ document: toPublicDocument(updated) });
  } catch (err) {
    await store.transition(doc.id, 'processing', { status: 'pending' }).catch(() => {});
    if (err instanceof HttpError) throw err;
    console.error('[sign] failed:', err);
    throw new HttpError(500, 'We could not finalise the signed document. Please try again.');
  }
}
