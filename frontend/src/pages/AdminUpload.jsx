import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, FileText, Loader2, Mail, MessageCircle, UploadCloud, X } from 'lucide-react';
import { Alert } from '../components/ui.jsx';
import CopyLinkButton from '../components/CopyLinkButton.jsx';
import * as api from '../services/api.js';
import { formatBytes } from '../lib/format.js';

const MAX_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB || 20);
const MAX_BYTES = MAX_MB * 1024 * 1024;

async function validatePdf(file) {
  if (!file) return 'Please choose a file.';
  const looksPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!looksPdf) return 'Only PDF files are allowed.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_BYTES) return `The file is larger than ${MAX_MB} MB.`;
  const head = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!head.includes('%PDF-')) return 'This file does not appear to be a valid PDF.';
  return null;
}

export default function AdminUpload() {
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing | done
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = async (f) => {
    setError('');
    setResult(null);
    setPhase('idle');
    const problem = await validatePdf(f);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (phase === 'uploading' || phase === 'processing') return;
    const files = e.dataTransfer.files;
    if (files.length > 1) setError('Please upload one PDF at a time.');
    else if (files[0]) choose(files[0]);
  };

  const upload = async () => {
    if (!file) return;
    setError('');
    setProgress(0);
    setPhase('uploading');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const doc = await api.uploadDocument(file, {
        signal: controller.signal,
        onProgress: (p) => {
          setProgress(p);
          if (p >= 100) setPhase('processing');
        },
      });
      setResult(doc);
      setPhase('done');
    } catch (err) {
      setPhase('idle');
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') setError('Upload cancelled.');
      else setError(api.errorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      abortRef.current = null;
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setPhase('idle');
    setProgress(0);
    setError('');
  };

  const busy = phase === 'uploading' || phase === 'processing';

  if (phase === 'done' && result) {
    const link = api.shareUrl(result);
    const message = encodeURIComponent(`Please review and sign "${result.name}": ${link}`);
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          <div className="flex flex-col items-center border-b border-slate-100 bg-emerald-50/60 px-6 py-8 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Document uploaded</h1>
            <p className="mt-1 max-w-md break-words text-sm text-slate-600">
              <b className="font-medium text-slate-800">{result.name}</b> is ready. A signature field was added
              {result.signatureField.onAppendedPage ? ' on a dedicated signature page at the end.' : ' at the end of the last page.'}
            </p>
          </div>
          <div className="space-y-4 p-6">
            <div>
              <label className="label" htmlFor="share-link">Shareable signing link</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input id="share-link" className="input font-mono text-xs" value={link} readOnly onFocus={(e) => e.target.select()} />
                <CopyLinkButton url={link} className="btn-primary shrink-0" />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">Anyone with this link can view and sign this document only. Keep it private.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="btn-secondary" href={`https://wa.me/?text=${message}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4 text-emerald-600" /> Share on WhatsApp
              </a>
              <a className="btn-secondary" href={`mailto:?subject=${encodeURIComponent(`Signature requested: ${result.name}`)}&body=${message}`}>
                <Mail className="h-4 w-4 text-brand-600" /> Share via email
              </a>
              <a className="btn-secondary" href={`/document/${result.id}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Preview document
              </a>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3">
            <button type="button" className="btn-ghost" onClick={reset}><UploadCloud className="h-4 w-4" /> Upload another</button>
            <Link to="/admin/documents" className="btn-ghost">Go to dashboard →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Upload a document</h1>
        <p className="mt-1 text-sm text-slate-500">Upload a PDF to generate a secure link for signing. A signature field is added automatically at the end.</p>
      </div>

      <div className="card p-4 sm:p-6">
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-disabled={busy}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => !busy && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
            dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <UploadCloud className="h-7 w-7 text-brand-600" />
          </div>
          <p className="text-sm font-medium text-slate-800">
            Drag & drop your PDF here, or <span className="text-brand-600 underline-offset-2 hover:underline">browse files</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">PDF only · up to {MAX_MB} MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) choose(f); }}
          />
        </div>

        {error && <Alert type="error" className="mt-4" onClose={() => setError('')}>{error}</Alert>}

        {file && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50">
                <FileText className="h-5 w-5 text-red-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800" title={file.name}>{file.name}</p>
                <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
              </div>
              {!busy && (
                <button type="button" className="btn-icon" onClick={reset} aria-label="Remove file"><X className="h-4 w-4" /></button>
              )}
            </div>
            {busy && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full rounded-full bg-brand-600 transition-all ${phase === 'processing' ? 'animate-pulse' : ''}`} style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {phase === 'processing' ? 'Processing document and placing signature field…' : `Uploading… ${progress}%`}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          {phase === 'uploading' && (
            <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>
          )}
          <button type="button" className="btn-primary" disabled={!file || busy} onClick={upload}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {busy ? 'Uploading…' : 'Upload document'}
          </button>
        </div>
      </div>
    </div>
  );
}
