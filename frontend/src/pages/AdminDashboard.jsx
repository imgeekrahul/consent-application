import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Download, Eye, FileCheck2, FileSignature, FileText, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Alert, ConfirmDialog, Spinner, StatusBadge } from '../components/ui.jsx';
import CopyLinkButton from '../components/CopyLinkButton.jsx';
import * as api from '../services/api.js';
import { formatBytes, formatDateTime, timeAgo } from '../lib/format.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'signed', label: 'Signed' },
];

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function DocumentActions({ doc, onDelete }) {
  const iconBtn = 'btn-icon border border-slate-200 bg-white shadow-sm';
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <CopyLinkButton url={api.shareUrl(doc)} className={iconBtn} compact label="Copy shareable link" />
      <a href={`/document/${doc.id}`} target="_blank" rel="noopener noreferrer" className={iconBtn} title="Preview document" aria-label="Preview document">
        <Eye className="h-4 w-4" />
      </a>
      <a href={api.originalPdfUrl(doc.id, doc.accessToken, { download: true })} className={iconBtn} title="Download original PDF" aria-label="Download original PDF">
        <Download className="h-4 w-4" />
      </a>
      {doc.status === 'signed' && (
        <a
          href={api.signedPdfUrl(doc.id, doc.accessToken)}
          className="btn-icon border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100 hover:text-emerald-800"
          title="Download signed PDF"
          aria-label="Download signed PDF"
        >
          <FileCheck2 className="h-4 w-4" />
        </a>
      )}
      <button type="button" onClick={() => onDelete(doc)} className={`${iconBtn} hover:border-red-200 hover:bg-red-50 hover:text-red-600`} title="Delete document" aria-label="Delete document">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function SignerInfo({ doc }) {
  if (doc.status !== 'signed') {
    return (
      <span className="text-xs text-slate-500">
        {doc.viewCount ? `Viewed ${doc.viewCount}× · last ${timeAgo(doc.lastViewedAt)}` : 'Not opened yet'}
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-600">
      by <b className="font-medium text-slate-800">{doc.signing.signerName}</b> · {formatDateTime(doc.signing.signedAt)}
    </span>
  );
}

export default function AdminDashboard() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    setError('');
    try {
      setDocs(await api.listDocuments());
    } catch (err) {
      setError(api.errorMessage(err, 'Could not load documents.'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Pick up signatures that happen while the dashboard is open.
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [load]);

  const stats = useMemo(() => {
    const list = docs || [];
    return {
      total: list.length,
      pending: list.filter((d) => d.status !== 'signed').length,
      signed: list.filter((d) => d.status === 'signed').length,
    };
  }, [docs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs || []).filter(
      (d) =>
        (filter === 'all' || d.status === filter) &&
        (!q || d.name.toLowerCase().includes(q) || d.id.includes(q) || d.signing?.signerName?.toLowerCase().includes(q)),
    );
  }, [docs, query, filter]);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteDocument(toDelete.id);
      setDocs((list) => list.filter((d) => d.id !== toDelete.id));
      setNotice(`“${toDelete.name}” was deleted.`);
      setToDelete(null);
    } catch (err) {
      setError(api.errorMessage(err, 'Could not delete the document.'));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Documents</h1>
          <p className="mt-1 text-sm text-slate-500">Track signing status and share links with signers.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={load} disabled={refreshing} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span>
          </button>
          <Link to="/admin/upload/file" className="btn-primary"><Plus className="h-4 w-4" /> Upload New PDF</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={FileText} label="Total" value={docs ? stats.total : '–'} tone="brand" />
        <StatCard icon={Clock} label="Pending" value={docs ? stats.pending : '–'} tone="amber" />
        <StatCard icon={FileSignature} label="Signed" value={docs ? stats.signed : '–'} tone="emerald" />
      </div>

      {notice && <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>}
      {error && (
        <Alert type="error" title="Something went wrong">
          {error} <button type="button" className="font-medium underline" onClick={load}>Try again</button>
        </Alert>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${filter === f.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search by name, signer or ID" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
          </div>
        </div>

        {!docs && !error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Spinner /> Loading documents…</div>
        ) : docs && docs.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50"><FileText className="h-7 w-7 text-brand-600" /></div>
            <h2 className="text-base font-semibold text-slate-900">No documents yet</h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">Upload your first PDF to create a secure signing link you can share by WhatsApp or email.</p>
            <Link to="/admin/upload/file" className="btn-primary mt-5"><Plus className="h-4 w-4" /> Upload New PDF</Link>
          </div>
        ) : docs && visible.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-slate-500">No documents match your filters.</p>
        ) : docs ? (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/60">
                    <td className="max-w-xs px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50"><FileText className="h-4 w-4 text-red-500" /></div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800" title={doc.name}>{doc.name}</p>
                          <p className="text-xs text-slate-500">{doc.pageCount} page{doc.pageCount === 1 ? '' : 's'} · {formatBytes(doc.size)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(doc.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={doc.status} />
                        <SignerInfo doc={doc} />
                      </div>
                    </td>
                    <td className="px-4 py-3"><DocumentActions doc={doc} onDelete={setToDelete} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {visible.map((doc) => (
                <li key={doc.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50"><FileText className="h-4 w-4 text-red-500" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium text-slate-800">{doc.name}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(doc.createdAt)} · {doc.pageCount} pages · {formatBytes(doc.size)}</p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>
                  <SignerInfo doc={doc} />
                  <DocumentActions doc={doc} onDelete={setToDelete} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete document?"
        message={toDelete ? `“${toDelete.name}” and any signed copy will be permanently deleted. The share link will stop working.` : ''}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
