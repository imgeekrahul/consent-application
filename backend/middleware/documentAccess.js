import store from '../services/documentStore.js';
import { isValidDocumentId, tokensMatch } from '../services/ids.js';
import { readSession } from './auth.js';

/**
 * Loads `req.params.id` and authorises access. A request is allowed when it
 * carries the document's own access token (share link) or an admin session.
 * Unknown IDs and wrong tokens get the same 404 so documents can't be probed.
 */
export async function loadAuthorizedDocument(req, res, next) {
  const { id } = req.params;
  const notFound = () => res.status(404).json({ error: 'This document link is invalid or has expired.' });
  if (!isValidDocumentId(id)) return notFound();

  const doc = await store.get(id);
  if (!doc) return notFound();

  const provided = req.get('x-document-token') || (typeof req.query.t === 'string' ? req.query.t : '');
  const viaToken = tokensMatch(provided, doc.accessToken);
  const admin = viaToken ? null : readSession(req);
  if (!viaToken && !admin) return notFound();

  req.document = doc;
  req.accessVia = viaToken ? 'token' : 'admin';
  return next();
}
