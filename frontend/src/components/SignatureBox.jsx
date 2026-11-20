import { PenLine, RefreshCw } from 'lucide-react';

/**
 * The signature field drawn over the PDF page. Geometry is in PDF points
 * (top-left origin) and multiplied by `scale` to get CSS pixels, which keeps
 * it in exactly the same spot the server will embed the signature.
 */
export default function SignatureBox({ field, scale, signature, onClick, readOnly = false, highlight = true }) {
  const style = {
    left: field.left * scale,
    top: field.top * scale,
    width: field.width * scale,
    height: field.height * scale,
  };
  const fontSize = Math.max(9, Math.min(14, 12 * scale));
  const filled = Boolean(signature);
  const interactive = !readOnly;

  return (
    <div className="absolute z-[1]" style={style}>
      {!filled && interactive && (
        <span
          className="pointer-events-none absolute left-0 -translate-y-full whitespace-nowrap rounded-t-md bg-amber-500 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-white"
          style={{ fontSize: Math.max(8, fontSize * 0.72), top: 1 }}
        >
          Signature <span aria-hidden="true">*</span>
        </span>
      )}
      <button
        type="button"
        onClick={interactive ? onClick : undefined}
        disabled={!interactive}
        aria-label={filled ? 'Change your signature' : 'Click here to sign'}
        data-signature-field
        className={`group relative flex h-full w-full items-center justify-center rounded-sm border-2 border-dashed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
          filled
            ? 'border-brand-400/70 bg-brand-50/30 hover:bg-brand-50/60'
            : `border-amber-500 bg-amber-50/90 hover:bg-amber-100 ${highlight && interactive ? 'animate-pulse-ring' : ''}`
        } ${interactive ? '' : 'cursor-default'}`}
      >
        {filled ? (
          <>
            <img src={signature} alt="Your signature" className="max-h-[88%] max-w-[94%] object-contain" draggable="false" />
            {interactive && (
              <span
                className="absolute -bottom-px right-0 hidden translate-y-full items-center gap-1 rounded-b-md bg-brand-600 px-1.5 py-0.5 font-medium text-white group-hover:flex group-focus-visible:flex"
                style={{ fontSize: Math.max(8, fontSize * 0.75) }}
              >
                <RefreshCw className="h-3 w-3" /> Change
              </span>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1.5 font-medium text-amber-800" style={{ fontSize }}>
            <PenLine style={{ width: fontSize * 1.25, height: fontSize * 1.25 }} aria-hidden="true" />
            {interactive ? 'Click here to sign' : 'Signature'}
          </span>
        )}
      </button>
    </div>
  );
}
