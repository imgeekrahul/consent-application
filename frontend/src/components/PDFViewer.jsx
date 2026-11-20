import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, FileWarning, Maximize2, Minus, Plus } from 'lucide-react';
import pdfjsLib from '../lib/pdfjs.js';
import { Spinner } from './ui.jsx';

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const ZOOM_STEPS = [0.4, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const PAD_Y = 24;
const MAX_CANVAS_PIXELS = 16_000_000; // iOS Safari canvas limit

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Renders one PDF page into a canvas. Re-renders off-screen, then swaps, so zooming never flashes blank. */
function PdfPageCanvas({ pdf, pageNumber, scale, cssWidth, cssHeight }) {
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task = null;
    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        let ratio = Math.min(window.devicePixelRatio || 1, 2.5);
        const base = page.getViewport({ scale });
        if (base.width * base.height * ratio * ratio > MAX_CANVAS_PIXELS) {
          ratio = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
        }
        const viewport = page.getViewport({ scale: scale * ratio });
        const off = document.createElement('canvas');
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        task = page.render({ canvas: off, viewport });
        await task.promise;
        if (cancelled || !canvasRef.current) return;
        const target = canvasRef.current;
        target.width = off.width;
        target.height = off.height;
        target.getContext('2d').drawImage(off, 0, 0);
        off.width = 0; // release memory
        setRendered(true);
        setFailed(false);
      } catch (err) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, scale]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block select-none"
        style={{ width: cssWidth, height: cssHeight }}
        aria-label={`Page ${pageNumber}`}
        role="img"
      />
      {!rendered && !failed && (
        <div className="absolute inset-0 flex items-center justify-center"><Spinner className="h-6 w-6" /></div>
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
          <FileWarning className="h-6 w-6" /> Couldn’t render this page
        </div>
      )}
    </>
  );
}

/**
 * Scrollable, zoomable PDF viewer built on pdf.js.
 *
 * - Pages render lazily (only those near the viewport hold a canvas).
 * - `extraPage` lets callers append a virtual page (used for the dedicated signature page).
 * - `renderPageOverlay(pageIndex, scale)` draws absolutely-positioned UI on top of a page,
 *   where 1 PDF point = `scale` CSS pixels.
 */
const PDFViewer = forwardRef(function PDFViewer(
  { url, httpHeaders, title, badge, actions, extraPage, renderPageOverlay, onLoad, bottomInset = 0 },
  ref,
) {
  const scrollerRef = useRef(null);
  const pageEls = useRef([]);
  const anchorRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [sizes, setSizes] = useState([]);
  const [error, setError] = useState(null);
  const [zoomMode, setZoomMode] = useState('auto'); // auto | fit | custom
  const [customScale, setCustomScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [nearPages, setNearPages] = useState(() => new Set([0, 1]));
  const [pageInput, setPageInput] = useState('1');

  const headersKey = JSON.stringify(httpHeaders || {});
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  // Load the document and every page's size up front (cheap; no rendering).
  useEffect(() => {
    let destroyed = false;
    setPdf(null);
    setSizes([]);
    setError(null);
    const task = pdfjsLib.getDocument({
      url,
      httpHeaders: JSON.parse(headersKey),
      withCredentials: true,
      isEvalSupported: false,
      enableXfa: false,
    });
    task.promise
      .then(async (doc) => {
        const list = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          list.push({ width: vp.width, height: vp.height });
        }
        if (destroyed) return;
        setPdf(doc);
        setSizes(list);
        onLoadRef.current?.(doc);
      })
      .catch((err) => {
        if (destroyed) return;
        const status = err?.status;
        setError(
          status === 404
            ? 'This document could not be found. The link may be invalid or the document was removed.'
            : err?.name === 'PasswordException'
              ? 'This PDF is password protected and cannot be displayed.'
              : 'The document could not be loaded. Please check your connection and try again.',
        );
      });
    return () => {
      destroyed = true;
      task.destroy();
    };
  }, [url, headersKey]);

  const allSizes = useMemo(
    () => (extraPage ? [...sizes, { width: extraPage.width, height: extraPage.height, extra: true }] : sizes),
    [sizes, extraPage],
  );
  const totalPages = allSizes.length;

  // Track the container width for fit-to-width.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    if (!allSizes.length || !containerWidth) return 1;
    const gutter = containerWidth < 640 ? 16 : 64;
    const maxW = Math.max(...allSizes.map((s) => s.width));
    return clamp((containerWidth - gutter) / maxW, MIN_SCALE, MAX_SCALE);
  }, [allSizes, containerWidth]);

  const scale = zoomMode === 'fit' ? fitScale : zoomMode === 'auto' ? Math.min(fitScale, 1.25) : customScale;

  // Remember where the reader is before a zoom change so we can restore it after.
  const captureAnchor = useCallback(() => {
    const el = scrollerRef.current;
    const page = pageEls.current[currentPage];
    if (!el || !page) return;
    anchorRef.current = { index: currentPage, fraction: (el.scrollTop - page.offsetTop) / page.offsetHeight };
  }, [currentPage]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const el = scrollerRef.current;
    const page = anchor && pageEls.current[anchor.index];
    if (el && page) el.scrollTop = page.offsetTop + anchor.fraction * page.offsetHeight;
    anchorRef.current = null;
  }, [scale]);

  const setZoom = (next) => {
    captureAnchor();
    setCustomScale(clamp(next, MIN_SCALE, MAX_SCALE));
    setZoomMode('custom');
  };
  const zoomIn = () => setZoom(ZOOM_STEPS.find((s) => s > scale + 0.001) ?? MAX_SCALE);
  const zoomOut = () => setZoom([...ZOOM_STEPS].reverse().find((s) => s < scale - 0.001) ?? MIN_SCALE);
  const fitWidth = () => {
    captureAnchor();
    setZoomMode('fit');
  };

  // Current page + which pages are close enough to render.
  const updateVisibility = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const probe = top + el.clientHeight * 0.35;
    const margin = el.clientHeight * 1.5;
    let current = 0;
    const near = new Set();
    pageEls.current.forEach((p, i) => {
      if (!p) return;
      if (p.offsetTop <= probe) current = i;
      if (p.offsetTop + p.offsetHeight >= top - margin && p.offsetTop <= bottom + margin) near.add(i);
    });
    // Scrolled to the very end → treat the last page as current.
    if (top + el.clientHeight >= el.scrollHeight - 4) current = pageEls.current.length - 1;
    setCurrentPage(current);
    setNearPages((prev) => (prev.size === near.size && [...near].every((n) => prev.has(n)) ? prev : near));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateVisibility);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [updateVisibility]);

  useLayoutEffect(() => {
    pageEls.current.length = totalPages;
    updateVisibility();
  }, [totalPages, scale, updateVisibility]);

  useEffect(() => setPageInput(String(currentPage + 1)), [currentPage]);

  const scrollToPage = useCallback((index, offsetPts = 0, behavior = 'smooth') => {
    const el = scrollerRef.current;
    const page = pageEls.current[clamp(index, 0, pageEls.current.length - 1)];
    if (!el || !page) return;
    el.scrollTo({ top: Math.max(0, page.offsetTop - PAD_Y + offsetPts * scale), behavior });
  }, [scale]);

  useImperativeHandle(ref, () => ({
    scrollToPage,
    /** Scrolls so that a rectangle (PDF points) on a page is centred in view. */
    scrollToRect(index, top, height) {
      const el = scrollerRef.current;
      const page = pageEls.current[index];
      if (!el || !page) return;
      const y = page.offsetTop + (top + height / 2) * scale - el.clientHeight / 2;
      el.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    },
  }), [scrollToPage, scale]);

  const submitPageInput = (e) => {
    e.preventDefault();
    const n = Number.parseInt(pageInput, 10);
    if (Number.isFinite(n)) scrollToPage(clamp(n, 1, totalPages) - 1);
    else setPageInput(String(currentPage + 1));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 shadow-sm sm:gap-4 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900" title={title}>{title}</h1>
          </div>
          {badge && <div className="hidden shrink-0 sm:block">{badge}</div>}
        </div>

        <form onSubmit={submitPageInput} className="flex shrink-0 items-center gap-0.5" aria-label="Page navigation">
          <button type="button" className="btn-icon h-8 w-8" onClick={() => scrollToPage(currentPage - 1)} disabled={!totalPages || currentPage === 0} aria-label="Previous page">
            <ChevronUp className="h-4 w-4" />
          </button>
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onBlur={submitPageInput}
            inputMode="numeric"
            aria-label="Current page"
            className="h-8 w-10 rounded-md border border-slate-300 text-center text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            disabled={!totalPages}
          />
          <span className="whitespace-nowrap px-1 text-sm text-slate-500">/ {totalPages || '–'}</span>
          <button type="button" className="btn-icon h-8 w-8" onClick={() => scrollToPage(currentPage + 1)} disabled={!totalPages || currentPage >= totalPages - 1} aria-label="Next page">
            <ChevronDown className="h-4 w-4" />
          </button>
        </form>

        <div className="hidden shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 p-0.5 sm:flex" aria-label="Zoom">
          <button type="button" className="btn-icon h-8 w-8" onClick={zoomOut} disabled={scale <= MIN_SCALE + 0.001} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          <span className="w-12 text-center text-xs font-medium tabular-nums text-slate-600">{Math.round(scale * 100)}%</span>
          <button type="button" className="btn-icon h-8 w-8" onClick={zoomIn} disabled={scale >= MAX_SCALE - 0.001} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
          <button type="button" className={`btn-icon h-8 w-8 ${zoomMode === 'fit' ? 'bg-brand-50 text-brand-700' : ''}`} onClick={fitWidth} aria-label="Fit to width" title="Fit to width">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>

      {/* Mobile zoom controls float bottom-right */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollerRef} className="absolute inset-0 overflow-auto overscroll-contain bg-slate-200/70" style={{ scrollBehavior: 'auto' }}>
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <FileWarning className="h-10 w-10 text-slate-400" />
              <p className="max-w-sm text-sm text-slate-600">{error}</p>
            </div>
          ) : !pdf ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
              <Spinner className="h-8 w-8" /> Loading document…
            </div>
          ) : (
            <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4 px-2 sm:gap-6 sm:px-8" style={{ paddingTop: PAD_Y, paddingBottom: PAD_Y + bottomInset }}>
              {allSizes.map((size, i) => {
                const w = Math.floor(size.width * scale);
                const h = Math.floor(size.height * scale);
                return (
                  <div
                    key={i}
                    ref={(el) => { pageEls.current[i] = el; }}
                    data-page={i + 1}
                    className="relative shrink-0 overflow-hidden bg-white shadow-page"
                    style={{ width: w, height: h }}
                  >
                    {size.extra
                      ? extraPage.render(scale)
                      : nearPages.has(i) && <PdfPageCanvas pdf={pdf} pageNumber={i + 1} scale={scale} cssWidth={w} cssHeight={h} />}
                    {renderPageOverlay?.(i, scale)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {pdf && (
          <div className="absolute right-3 z-10 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg sm:hidden" style={{ bottom: 12 + bottomInset }}>
            <button type="button" className="btn-icon" onClick={zoomIn} aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            <button type="button" className="btn-icon" onClick={zoomOut} aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
            <button type="button" className="btn-icon" onClick={fitWidth} aria-label="Fit to width"><Maximize2 className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
});

export default PDFViewer;
