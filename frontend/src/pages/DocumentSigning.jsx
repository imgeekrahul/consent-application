import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Download, Eye, FileX2, Loader2, Lock, PenLine, ShieldCheck } from 'lucide-react';
import PDFViewer from '../components/PDFViewer.jsx';
import SignatureBox from '../components/SignatureBox.jsx';
import SignatureModal from '../components/SignatureModal.jsx';
import SignaturePage from '../components/SignaturePage.jsx';
import { Alert, FullPageSpinner, Logo, Modal, StatusBadge } from '../components/ui.jsx';
import * as api from '../services/api.js';
import { formatDateTime } from '../lib/format.js';

function InvalidLink({ message }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="card max-w-md p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <FileX2 className="h-7 w-7 text-red-500" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Document unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <p className="mt-4 text-xs text-slate-400">If you believe this is a mistake, ask the sender for a new link.</p>
      </div>
    </div>
  );
}

export default function DocumentSigning() {
  const { documentId } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const isAdminPreview = !token;

  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [signature, setSignature] = useState(null); // { dataUrl, type, name, email }
  const [modalOpen, setModalOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const viewerRef = useRef(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDoc(await api.getDocument(documentId, token));
    } catch (err) {
      const status = err?.response?.status;
      setLoadError(
        status === 404
          ? isAdminPreview
            ? 'This link is missing its access key. Use the full share link, or sign in as an administrator to preview.'
            : 'This document link is invalid, has expired, or the document was removed.'
          : api.errorMessage(err),
      );
    }
  }, [documentId, token, isAdminPreview]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (doc) document.title = `${doc.name} — SignDesk`;
    return () => { document.title = 'SignDesk — Sign documents online'; };
  }, [doc]);

  const signed = doc?.status === 'signed';
  const canSign = Boolean(doc) && !signed && !isAdminPreview;

  // Warn before leaving with an unsubmitted signature.
  useEffect(() => {
    if (!signature || signed) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [signature, signed]);

  const field = doc?.signatureField;
  const pdfUrl = useMemo(() => {
    if (!doc) return null;
    // After signing, show the real generated PDF so the embedded signature is what the user sees.
    return signed ? api.signedPdfUrl(doc.id, token, { download: false }) : api.originalPdfUrl(doc.id, token);
  }, [doc, signed, token]);

  const extraPage = useMemo(() => {
    if (!field?.onAppendedPage || signed) return null;
    return {
      width: field.pageWidth,
      height: field.pageHeight,
      render: (scale) => <SignaturePage scale={scale} documentName={doc.name} />,
    };
  }, [field, signed, doc?.name]);

  const renderOverlay = useCallback(
    (pageIndex, scale) => {
      if (!field || signed || pageIndex !== field.pageIndex) return null;
      return (
        <SignatureBox
          field={field}
          scale={scale}
          signature={signature?.dataUrl}
          readOnly={!canSign}
          onClick={() => setModalOpen(true)}
        />
      );
    },
    [field, signed, signature, canSign],
  );

  const goToField = () => field && viewerRef.current?.scrollToRect(field.pageIndex, field.top, field.height);

  const submit = async () => {
    setSubmitError('');
    if (!signature) {
      setSubmitError('Please add your signature first.');
      goToField();
      return;
    }
    if (!consent) {
      setSubmitError('Please confirm that you agree to sign electronically.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.signDocument(doc.id, token, {
        signerName: signature.name,
        signerEmail: signature.email || undefined,
        signatureType: signature.type,
        signatureImage: signature.dataUrl,
        consent: true,
      });
      setDoc(updated);
      setSuccessOpen(true);
    } catch (err) {
      if (err?.response?.data?.code === 'ALREADY_SIGNED') {
        await load();
      }
      setSubmitError(api.errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <InvalidLink message={loadError} />;
  if (!doc) return <FullPageSpinner label="Opening document…" />;

  const downloadHref = signed
    ? api.signedPdfUrl(doc.id, token)
    : api.originalPdfUrl(doc.id, token, { download: true });

  return (
    <div className="flex h-dvh flex-col bg-white">
      {/* Brand header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
        <Logo />
        <span className="hidden items-center gap-1 text-xs text-slate-500 sm:inline-flex">
          <Lock className="h-3.5 w-3.5" /> Secure document link
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="sm:hidden"><StatusBadge status={doc.status} /></span>
          {isAdminPreview && (
            <Link to="/admin/documents" className="btn-ghost px-3 py-1.5 text-xs">Back to dashboard</Link>
          )}
        </div>
      </header>

      {/* Context banner */}
      {signed ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Signed by <b className="font-semibold">{doc.signing.signerName}</b> on {formatDateTime(doc.signing.signedAt)}
          </span>
          <span className="text-xs text-emerald-700/80">Transaction ID: {doc.signing.transactionId}</span>
        </div>
      ) : isAdminPreview ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-900">
          <Eye className="h-4 w-4 shrink-0 text-brand-600" />
          Admin preview — signing is disabled here. Share the document link with the signer to collect a signature.
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <PenLine className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1">
            {signature ? 'Signature added. Review the document, then click Finish & Submit.' : 'Please review the document and click the highlighted field to sign.'}
          </span>
          <button type="button" onClick={goToField} className="shrink-0 rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600">
            {signature ? 'View signature' : 'Go to signature'}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <PDFViewer
          key={pdfUrl}
          ref={viewerRef}
          url={pdfUrl}
          httpHeaders={token ? { 'X-Document-Token': token } : undefined}
          title={doc.name}
          badge={<StatusBadge status={doc.status} />}
          extraPage={extraPage}
          renderPageOverlay={renderOverlay}
          actions={
            <a href={downloadHref} className="btn-secondary px-2.5 py-1.5 sm:px-3" title={signed ? 'Download signed PDF' : 'Download original PDF'}>
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">{signed ? 'Download signed' : 'Download'}</span>
            </a>
          }
        />
      </div>

      {/* Action bar */}
      {canSign && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(15_23_42/0.06)] sm:px-4">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-full sm:flex ${signature ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                {signature ? <CheckCircle2 className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}
              </div>
              <label className="flex min-w-0 cursor-pointer items-start gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => { setConsent(e.target.checked); setSubmitError(''); }}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>
                  I have reviewed this document and agree to sign it electronically. My electronic signature is the legal equivalent of my handwritten signature.
                </span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary flex-1 sm:flex-none" onClick={() => setModalOpen(true)}>
                <PenLine className="h-4 w-4" /> {signature ? 'Change signature' : 'Sign'}
              </button>
              <button type="button" className="btn-primary flex-1 px-5 sm:flex-none" onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {submitting ? 'Submitting…' : 'Finish & Submit'}
              </button>
            </div>
          </div>
          {submitError && <Alert type="error" className="mx-auto mt-3 max-w-5xl" onClose={() => setSubmitError('')}>{submitError}</Alert>}
        </div>
      )}

      <SignatureModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialName={signature?.name}
        initialEmail={signature?.email}
        onApply={(sig) => {
          setSignature(sig);
          setModalOpen(false);
          setSubmitError('');
          requestAnimationFrame(goToField);
        }}
      />

      <Modal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        size="sm"
        title="Document signed successfully"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setSuccessOpen(false)}>View document</button>
            <a href={api.signedPdfUrl(doc.id, token)} className="btn-primary" data-autofocus>
              <Download className="h-4 w-4" /> Download signed PDF
            </a>
          </>
        }
      >
        <div className="flex flex-col items-center py-2 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <p className="text-sm text-slate-600">
            Thank you, <b className="text-slate-800">{doc.signing?.signerName}</b>. Your signature has been securely embedded into the document.
          </p>
          <dl className="mt-4 w-full space-y-1.5 rounded-lg bg-slate-50 p-3 text-left text-xs">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Signed at</dt><dd className="font-medium text-slate-800">{formatDateTime(doc.signing?.signedAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Transaction ID</dt><dd className="break-all font-mono font-medium text-slate-800">{doc.signing?.transactionId}</dd></div>
          </dl>
        </div>
      </Modal>
    </div>
  );
}
