/**
 * Visual stand-in for the dedicated signature page the server appends to the
 * signed PDF when the last page has no room. Layout mirrors pdfSigner.js
 * (sizes in PDF points × scale) so what you see is what gets generated.
 */
export default function SignaturePage({ scale, documentName }) {
  const pt = (v) => v * scale;
  return (
    <div className="absolute inset-0 select-none text-left" aria-label="Signature page">
      <div className="absolute inset-x-0 top-0 bg-brand-600" style={{ height: pt(8) }} />
      <div className="absolute" style={{ left: pt(72), top: pt(52), right: pt(72) }}>
        <p className="font-bold text-slate-800" style={{ fontSize: pt(20), lineHeight: 1.2 }}>Signature Page</p>
        <p className="text-slate-500" style={{ fontSize: pt(10.5), marginTop: pt(6), lineHeight: 1.4 }}>
          This page was added to capture the signature for “{documentName}”.
        </p>
        <div className="border-t border-slate-300" style={{ marginTop: pt(14) }} />
      </div>
      <p className="absolute font-bold text-slate-500" style={{ left: pt(72), top: pt(190), fontSize: pt(9) }}>Signature</p>
    </div>
  );
}
