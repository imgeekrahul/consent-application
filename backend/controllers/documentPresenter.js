import config from '../config/index.js';

/** Public view of a document: no tokens, hashes, IPs or storage details. */
export function toPublicDocument(doc) {
  const signed = doc.status === 'signed';
  return {
    id: doc.id,
    name: doc.originalName,
    pageCount: doc.pageCount,
    status: signed ? 'signed' : 'pending',
    signatureField: doc.signatureField,
    createdAt: doc.createdAt,
    signing: signed
      ? {
          signerName: doc.signing.signerName,
          signedAt: doc.signing.signedAt,
          transactionId: doc.signing.transactionId,
        }
      : null,
  };
}

export function shareUrlFor(doc, req) {
  const base = config.publicAppUrl || `${req.protocol}://${req.get('host')}`;
  return `${base}/document/${doc.id}?t=${doc.accessToken}`;
}

/** Admin view: includes the access token so the share link can be rebuilt. */
export function toAdminDocument(doc, req) {
  return {
    id: doc.id,
    name: doc.originalName,
    size: doc.size,
    pageCount: doc.pageCount,
    status: doc.status === 'signed' ? 'signed' : 'pending',
    accessToken: doc.accessToken,
    shareUrl: shareUrlFor(doc, req),
    sharePath: `/document/${doc.id}?t=${doc.accessToken}`,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    viewCount: doc.viewCount || 0,
    lastViewedAt: doc.lastViewedAt || null,
    signatureField: doc.signatureField,
    signing: doc.status === 'signed'
      ? {
          signerName: doc.signing.signerName,
          signerEmail: doc.signing.signerEmail || null,
          signatureType: doc.signing.signatureType,
          signedAt: doc.signing.signedAt,
          transactionId: doc.signing.transactionId,
        }
      : null,
  };
}
