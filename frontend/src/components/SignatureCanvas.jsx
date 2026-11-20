import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { trimCanvas } from '../lib/signatureImage.js';

/**
 * Pressure-sensitive drawing surface (mouse, touch, stylus) backed by
 * signature_pad. Handles high-DPI screens and resizing without losing strokes.
 */
const SignatureCanvas = forwardRef(function SignatureCanvas({ color = '#111827', onChange, className = '' }, ref) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [empty, setEmpty] = useState(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const data = pad.toData();
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    pad.clear();
    pad.fromData(data);
  }, []);

  useEffect(() => {
    const pad = new SignaturePad(canvasRef.current, {
      penColor: color,
      minWidth: 0.9,
      maxWidth: 3.2,
      velocityFilterWeight: 0.6,
    });
    padRef.current = pad;
    const handleEnd = () => {
      setEmpty(pad.isEmpty());
      onChangeRef.current?.(!pad.isEmpty());
    };
    pad.addEventListener('endStroke', handleEnd);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvasRef.current);
    return () => {
      ro.disconnect();
      pad.removeEventListener('endStroke', handleEnd);
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recolour existing strokes when the ink colour changes.
  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    pad.penColor = color;
    const data = pad.toData().map((group) => ({ ...group, penColor: color }));
    pad.clear();
    pad.fromData(data);
  }, [color]);

  useImperativeHandle(ref, () => ({
    clear() {
      padRef.current?.clear();
      setEmpty(true);
      onChangeRef.current?.(false);
    },
    undo() {
      const pad = padRef.current;
      if (!pad) return;
      const data = pad.toData();
      data.pop();
      pad.fromData(data);
      setEmpty(pad.isEmpty());
      onChangeRef.current?.(!pad.isEmpty());
    },
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    /** Returns a cropped transparent PNG data URL, or null when nothing is drawn. */
    toDataURL() {
      const pad = padRef.current;
      if (!pad || pad.isEmpty()) return null;
      return trimCanvas(canvasRef.current, 16)?.toDataURL('image/png') ?? null;
    },
  }), []);

  return (
    <div className={`relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white ${className}`}>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="Signature drawing area" />
      <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-slate-300" />
      <span className="pointer-events-none absolute bottom-9 left-6 text-lg text-slate-300">×</span>
      {empty && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          Draw your signature here
        </span>
      )}
    </div>
  );
});

export default SignatureCanvas;
