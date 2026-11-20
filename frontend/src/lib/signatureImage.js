/**
 * Helpers that turn every signature method (draw / type / upload) into a
 * tightly-cropped transparent PNG data URL — the single format the API accepts.
 */

const MAX_W = 1200;
const MAX_H = 400;

export const SIGNATURE_FONTS = [
  { id: 'great-vibes', label: 'Great Vibes', family: '"Great Vibes"', size: 120 },
  { id: 'dancing-script', label: 'Dancing Script', family: '"Dancing Script"', size: 110 },
  { id: 'sacramento', label: 'Sacramento', family: 'Sacramento', size: 130 },
  { id: 'caveat', label: 'Caveat', family: 'Caveat', size: 110 },
];

export const INK_COLORS = [
  { id: 'black', label: 'Black', value: '#111827' },
  { id: 'blue', label: 'Blue', value: '#1d3fb8' },
  { id: 'green', label: 'Green', value: '#166534' },
];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Crops a canvas to its non-transparent pixels and limits the output size. */
export function trimCanvas(source, padding = 12) {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  const { width, height } = source;
  const { data } = ctx.getImageData(0, 0, width, height);
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null; // empty

  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  const w = right - left + 1;
  const h = bottom - top + 1;
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  const out = makeCanvas(w * scale, h * scale);
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(source, left, top, w, h, 0, 0, out.width, out.height);
  return out;
}

export async function renderTypedSignature(text, font, color) {
  const value = text.trim();
  if (!value) return null;
  try {
    await document.fonts.load(`${font.size}px ${font.family}`, value);
  } catch {
    /* fall back to whatever font is available */
  }
  const measure = makeCanvas(10, 10).getContext('2d');
  measure.font = `${font.size}px ${font.family}`;
  const width = Math.ceil(measure.measureText(value).width) + font.size;
  const height = Math.ceil(font.size * 1.9);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.font = `${font.size}px ${font.family}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, font.size / 2, height / 2);
  return trimCanvas(canvas, 10)?.toDataURL('image/png') ?? null;
}

const ACCEPTED_UPLOADS = ['image/png', 'image/jpeg'];
export const MAX_UPLOAD_IMAGE_BYTES = 5 * 1024 * 1024;

function hasValidMagicBytes(bytes) {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png || jpg;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image could not be read.'));
    img.src = src;
  });
}

/**
 * Validates an uploaded PNG/JPG, optionally removes a white/light background,
 * crops it, and returns a PNG data URL.
 */
export async function processUploadedSignature(file, { removeBackground = true } = {}) {
  if (!ACCEPTED_UPLOADS.includes(file.type)) throw new Error('Please upload a PNG or JPG image.');
  if (file.size > MAX_UPLOAD_IMAGE_BYTES) throw new Error('The image must be smaller than 5 MB.');
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (!hasValidMagicBytes(head)) throw new Error('This file is not a valid PNG or JPG image.');

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, 1600 / img.naturalWidth, 800 / img.naturalHeight);
    const canvas = makeCanvas(img.naturalWidth * scale, img.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (removeBackground) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum > 225) d[i + 3] = 0;
        else if (lum > 180) d[i + 3] = Math.min(d[i + 3], Math.round(((225 - lum) / 45) * 255));
      }
      ctx.putImageData(imageData, 0, 0);
    }
    const trimmed = trimCanvas(canvas, 8);
    if (!trimmed) throw new Error('The image looks empty. Try turning off background removal.');
    return trimmed.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function dataUrlByteSize(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}
