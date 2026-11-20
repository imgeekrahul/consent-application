import multer from 'multer';
import config from '../config/index.js';
import { HttpError } from './errorHandler.js';

/**
 * PDFs are buffered in memory (bounded by MAX_UPLOAD_MB) so they can be fully
 * validated before anything touches the disk.
 */
export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // browsers send UTF-8 file names
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5, parts: 6 },
  fileFilter(req, file, cb) {
    if (file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(file.originalname || '')) {
      return cb(new HttpError(415, 'Only PDF files are allowed.'));
    }
    return cb(null, true);
  },
}).single('file');
