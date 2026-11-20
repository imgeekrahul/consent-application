import { useEffect, useRef, useState } from 'react';
import { Eraser, ImageUp, Keyboard, Loader2, PenTool, Undo2, X } from 'lucide-react';
import '@fontsource/great-vibes/400.css';
import '@fontsource/dancing-script/500.css';
import '@fontsource/sacramento/400.css';
import '@fontsource/caveat/500.css';
import { Alert, Modal } from './ui.jsx';
import SignatureCanvas from './SignatureCanvas.jsx';
import {
  INK_COLORS,
  SIGNATURE_FONTS,
  dataUrlByteSize,
  processUploadedSignature,
  renderTypedSignature,
} from '../lib/signatureImage.js';

const TABS = [
  { id: 'draw', label: 'Draw', Icon: PenTool },
  { id: 'type', label: 'Type', Icon: Keyboard },
  { id: 'upload', label: 'Upload', Icon: ImageUp },
];

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label="Ink colour">
      {INK_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          aria-label={c.label}
          title={c.label}
          onClick={() => onChange(c.value)}
          className={`h-6 w-6 rounded-full ring-offset-2 transition ${value === c.value ? 'ring-2 ring-brand-500' : 'ring-1 ring-slate-200 hover:ring-slate-400'}`}
          style={{ backgroundColor: c.value }}
        />
      ))}
    </div>
  );
}

function DrawTab({ color, setColor, canvasRef, onChange }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex gap-1">
          <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => canvasRef.current?.undo()}>
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => canvasRef.current?.clear()}>
            <Eraser className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>
      <SignatureCanvas ref={canvasRef} color={color} onChange={onChange} className="h-48 sm:h-56" />
      <p className="text-xs text-slate-500">Use your mouse, finger or stylus to sign inside the box.</p>
    </div>
  );
}

function TypeTab({ text, setText, fontId, setFontId, color, setColor }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="typed-signature">Signature text</label>
        <input id="typed-signature" className="input" value={text} maxLength={60} onChange={(e) => setText(e.target.value)} placeholder="Your full name" autoComplete="name" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Choose a style</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Signature style">
        {SIGNATURE_FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={fontId === f.id}
            onClick={() => setFontId(f.id)}
            className={`flex h-20 items-center justify-center overflow-hidden rounded-xl border px-3 text-left transition ${
              fontId === f.id ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span className="truncate" style={{ fontFamily: f.family, fontSize: f.id === 'caveat' ? 30 : 34, color }}>
              {text.trim() || 'Your Name'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadTab({ preview, busy, error, removeBg, setRemoveBg, onFile, onReset }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  return (
    <div className="space-y-3">
      {preview ? (
        <div className="space-y-2">
          <div
            className="flex h-48 items-center justify-center rounded-xl border border-slate-200 p-4"
            style={{ backgroundImage: 'repeating-conic-gradient(#f1f5f9 0% 25%, #fff 0% 50%)', backgroundSize: '16px 16px' }}
          >
            <img src={preview} alt="Uploaded signature preview" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Preview of your uploaded signature</span>
            <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={onReset}>
              <X className="h-3.5 w-3.5" /> Remove image
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition ${
            dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
          }`}
        >
          {busy ? <Loader2 className="h-7 w-7 animate-spin text-brand-600" /> : <ImageUp className="h-8 w-8 text-slate-400" />}
          <p className="text-sm font-medium text-slate-700">Drop an image or <span className="text-brand-600">browse</span></p>
          <p className="text-xs text-slate-500">PNG or JPG, up to 5 MB</p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
        Remove white background
      </label>
      {error && <Alert type="error">{error}</Alert>}
    </div>
  );
}

/**
 * Draw / Type / Upload signature dialog. Every method yields a transparent
 * PNG data URL which is passed to `onApply` together with the signer's details.
 */
export default function SignatureModal({ open, onClose, onApply, initialName = '', initialEmail = '' }) {
  const [tab, setTab] = useState('draw');
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [color, setColor] = useState(INK_COLORS[0].value);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [typedText, setTypedText] = useState(initialName);
  const [typedTouched, setTypedTouched] = useState(false);
  const [fontId, setFontId] = useState(SIGNATURE_FONTS[0].id);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [removeBg, setRemoveBg] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (open) {
      setError('');
      setHasDrawing(false); // the drawing canvas starts empty each time the dialog opens
      setName((n) => n || initialName);
      setEmail((e) => e || initialEmail);
    }
  }, [open, initialName, initialEmail]);

  // Keep the typed signature in sync with the name until the user edits it.
  useEffect(() => {
    if (!typedTouched) setTypedText(name);
  }, [name, typedTouched]);

  // (Re)process the uploaded image when the file or background option changes.
  useEffect(() => {
    if (!uploadFile) return undefined;
    let cancelled = false;
    setUploadBusy(true);
    setUploadError('');
    processUploadedSignature(uploadFile, { removeBackground: removeBg })
      .then((url) => !cancelled && setUploadPreview(url))
      .catch((err) => {
        if (cancelled) return;
        setUploadError(err.message);
        setUploadPreview(null);
        setUploadFile(null);
      })
      .finally(() => !cancelled && setUploadBusy(false));
    return () => { cancelled = true; };
  }, [uploadFile, removeBg]);

  const nameValid = name.trim().length >= 2;
  const emailValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const methodReady = tab === 'draw' ? hasDrawing : tab === 'type' ? typedText.trim().length > 0 : Boolean(uploadPreview);
  const canApply = nameValid && emailValid && methodReady && !applying && !uploadBusy;

  const apply = async () => {
    setError('');
    if (!nameValid) return setError('Please enter your full name.');
    if (!emailValid) return setError('Please enter a valid email address or leave it empty.');
    setApplying(true);
    try {
      let dataUrl = null;
      if (tab === 'draw') dataUrl = canvasRef.current?.toDataURL();
      else if (tab === 'type') dataUrl = await renderTypedSignature(typedText, SIGNATURE_FONTS.find((f) => f.id === fontId), color);
      else dataUrl = uploadPreview;
      if (!dataUrl) throw new Error(tab === 'draw' ? 'Please draw your signature first.' : 'Please provide a signature.');
      if (dataUrlByteSize(dataUrl) > MAX_SIGNATURE_BYTES) throw new Error('This signature image is too large. Please try a simpler image.');
      onApply({ dataUrl, type: tab, name: name.trim().replace(/\s+/g, ' '), email: email.trim() });
    } catch (err) {
      setError(err.message || 'Could not create the signature.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add your signature"
      description="Choose how you'd like to sign. You can review it before submitting."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={apply} disabled={!canApply}>
            {applying && <Loader2 className="h-4 w-4 animate-spin" />}
            Apply Signature
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="signer-name">Full name <span className="text-red-500">*</span></label>
            <input id="signer-name" data-autofocus className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="signer-email">Email <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="signer-email" type="email" className={`input ${emailValid ? '' : 'border-red-400'}`} value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>
        </div>

        <div>
          <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Signature method">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => { setTab(id); setError(''); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
                  tab === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div role="tabpanel">
          {/* Keep the canvas mounted so a drawing survives tab switches. */}
          <div className={tab === 'draw' ? '' : 'hidden'}>
            <DrawTab color={color} setColor={setColor} canvasRef={canvasRef} onChange={setHasDrawing} />
          </div>
          {tab === 'type' && (
            <TypeTab
              text={typedText}
              setText={(v) => { setTypedTouched(true); setTypedText(v); }}
              fontId={fontId}
              setFontId={setFontId}
              color={color}
              setColor={setColor}
            />
          )}
          {tab === 'upload' && (
            <UploadTab
              preview={uploadPreview}
              busy={uploadBusy}
              error={uploadError}
              removeBg={removeBg}
              setRemoveBg={setRemoveBg}
              onFile={(f) => setUploadFile(f)}
              onReset={() => { setUploadFile(null); setUploadPreview(null); setUploadError(''); }}
            />
          )}
        </div>

        {error && <Alert type="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
