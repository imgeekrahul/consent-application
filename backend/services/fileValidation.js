import { PDFDocument } from 'pdf-lib';
import { HttpError } from '../middleware/errorHandler.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/** True when the buffer starts with the `%PDF-` magic number (allowing a small junk prefix, as readers do). */
export function hasPdfSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  const idx = buffer.subarray(0, 1024).indexOf('%PDF-');
  return idx !== -1;
}

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (buffer.length > 3 && buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) return 'jpg';
  return null;
}

/**
 * Fully validates an uploaded PDF: MIME type, magic bytes, and that it can be
 * parsed (and later modified) by pdf-lib. Encrypted PDFs are rejected because
 * they cannot be signed without the owner password.
 */
export async function validatePdfUpload(file, { maxPages }) {
  if (!file) throw new HttpError(400, 'No file was uploaded. Please choose a PDF.');
  if (file.mimetype !== 'application/pdf') {
    throw new HttpError(415, 'Only PDF files are allowed.');
  }
  if (!/\.pdf$/i.test(file.originalname || '')) {
    throw new HttpError(415, 'The file must have a .pdf extension.');
  }
  if (!hasPdfSignature(file.buffer)) {
    throw new HttpError(415, 'This file is not a valid PDF document.');
  }

  let pdf;
  try {
    pdf = await PDFDocument.load(file.buffer, { updateMetadata: false });
  } catch (err) {
    if (/encrypt/i.test(err?.message || '')) {
      throw new HttpError(422, 'Password-protected PDFs cannot be signed. Please upload an unprotected copy.');
    }
    throw new HttpError(422, 'The PDF appears to be damaged and could not be read.');
  }

  const pageCount = pdf.getPageCount();
  if (pageCount < 1) throw new HttpError(422, 'The PDF has no pages.');
  if (pageCount > maxPages) throw new HttpError(422, `PDFs are limited to ${maxPages} pages.`);
  return { pdf, pageCount };
}

/** Parses a `data:image/png;base64,...` URL into a validated PNG buffer. */
export function parseSignatureDataUrl(dataUrl, maxBytes) {
  if (typeof dataUrl !== 'string') throw new HttpError(400, 'A signature image is required.');
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new HttpError(400, 'The signature must be a PNG image.');
  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length === 0) throw new HttpError(400, 'The signature image is empty.');
  if (buffer.length > maxBytes) throw new HttpError(413, 'The signature image is too large.');
  if (detectImageType(buffer) !== 'png') throw new HttpError(400, 'The signature image is not a valid PNG.');
  // IHDR width/height live at bytes 16..24.
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 4000 || height > 4000) {
    throw new HttpError(400, 'The signature image has invalid dimensions.');
  }
  return buffer;
}

/** Removes path components, control characters and odd whitespace from a user-provided file name. */
export function sanitizeFilename(name) {
  const base = String(name || 'document.pdf').split(/[\\/]/).pop();
  const cleaned = base
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (!cleaned || cleaned === '.pdf') return 'document.pdf';
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}
