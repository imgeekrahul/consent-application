import path from 'node:path';
import { createRequire } from 'node:module';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Decides where the signature field goes.
 *
 * The last page is rasterised server-side with pdf.js and scanned row by row
 * for "ink" (any non-white pixel: text, images, vector graphics). The field is
 * placed in the blank space below the main content of the last page, above any
 * footer (page numbers etc.). If the space is too small, or the page is rotated,
 * the field is put on a dedicated signature page that is appended only to the
 * signed copy — the original file is never modified.
 *
 * All geometry is in PDF points measured from the TOP-LEFT corner of the
 * visible page (the crop box), which maps directly onto the browser viewer:
 *   cssPx = points * (renderedPageWidthPx / pageWidthPts)
 */

export const FIELD_WIDTH = 200;
export const FIELD_HEIGHT = 64;
const CAPTION_SPACE = 26; // room under the field for "Signed by …" in the final PDF
const GAP_ABOVE = 24; // space between the last content line and the field
const BOTTOM_MARGIN = 36;
const SIDE_MARGIN = 36;
const SIGNATURE_PAGE_FIELD = { left: 72, top: 210 };

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
const standardFontDataUrl = path.join(pdfjsRoot, 'standard_fonts') + path.sep;

let createCanvas = null;
try {
  ({ createCanvas } = await import('@napi-rs/canvas'));
} catch {
  console.warn('[pdfLayout] @napi-rs/canvas unavailable; falling back to text-based layout detection.');
}

const INK_THRESHOLD = 235;

async function inkProfileFromRender(page, width, height) {
  const viewport = page.getViewport({ scale: 1 });
  const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rows = new Array(canvas.height).fill(false);
  let minX = Infinity;
  for (let y = 0; y < canvas.height; y++) {
    const offset = y * canvas.width * 4;
    for (let x = 0; x < canvas.width; x++) {
      const i = offset + x * 4;
      if (data[i] < INK_THRESHOLD || data[i + 1] < INK_THRESHOLD || data[i + 2] < INK_THRESHOLD) {
        rows[y] = true;
        if (x < minX) minX = x;
        break;
      }
    }
  }
  // The row scan stops at the first ink pixel, so minX is the true leftmost ink column.
  return { rows, minX: Number.isFinite(minX) ? minX : null };
}

async function inkProfileFromText(page, width, height) {
  const [vx, vy] = page.view;
  const { items } = await page.getTextContent();
  const rows = new Array(Math.ceil(height)).fill(false);
  let minX = Infinity;
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const [, , , , tx, ty] = item.transform;
    const fontHeight = Math.max(item.height || 10, 4);
    const baseline = height - (ty - vy);
    const top = Math.max(0, Math.floor(baseline - fontHeight));
    const bottom = Math.min(rows.length - 1, Math.ceil(baseline + fontHeight * 0.3));
    for (let y = top; y <= bottom; y++) rows[y] = true;
    minX = Math.min(minX, tx - vx);
  }
  return { rows, minX: Number.isFinite(minX) ? minX : null };
}

function signaturePageField(width, height, detection) {
  return {
    pageIndex: null, // filled by caller
    onAppendedPage: true,
    left: SIGNATURE_PAGE_FIELD.left,
    top: SIGNATURE_PAGE_FIELD.top,
    width: FIELD_WIDTH,
    height: FIELD_HEIGHT,
    pageWidth: width,
    pageHeight: height,
    detection,
  };
}

export function placeFieldFromProfile({ rows, minX }, width, height) {
  if (width < FIELD_WIDTH + SIDE_MARGIN * 2 || height < 300) return null;

  const footerStart = Math.floor(height - Math.min(80, height * 0.09));
  let mainBottom = -1;
  for (let y = Math.min(footerStart, rows.length) - 1; y >= 0; y--) {
    if (rows[y]) { mainBottom = y; break; }
  }
  let footerTop = height;
  for (let y = footerStart; y < rows.length; y++) {
    if (rows[y]) { footerTop = y; break; }
  }

  const top = mainBottom < 0 ? 72 : mainBottom + GAP_ABOVE;
  const limit = footerTop >= height ? height - BOTTOM_MARGIN : footerTop - 10;
  if (top + FIELD_HEIGHT + CAPTION_SPACE > limit) return null;

  const left = Math.min(Math.max(minX ?? 72, SIDE_MARGIN), width - FIELD_WIDTH - SIDE_MARGIN);
  return { left: Math.round(left), top: Math.round(top) };
}

/**
 * @param {Buffer} pdfBuffer original PDF bytes
 * @returns {Promise<object>} signature field definition
 */
export async function computeSignatureField(pdfBuffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  try {
    const pageCount = pdf.numPages;
    const page = await pdf.getPage(pageCount);
    const [x0, y0, x1, y1] = page.view;
    const rotation = ((page.rotate % 360) + 360) % 360;
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    // Rotated pages get a dedicated, upright signature page.
    const visualW = rotation % 180 === 0 ? width : height;
    const visualH = rotation % 180 === 0 ? height : width;
    const appended = (detection) => ({
      ...signaturePageField(Math.max(visualW, 400), Math.max(visualH, 500), detection),
      pageIndex: pageCount,
    });

    if (rotation !== 0) return appended('rotated-page');

    let profile = null;
    let detection = 'render';
    if (createCanvas) {
      try {
        profile = await inkProfileFromRender(page, width, height);
      } catch (err) {
        console.warn('[pdfLayout] render analysis failed, using text analysis:', err.message);
      }
    }
    if (!profile) {
      detection = 'text';
      profile = await inkProfileFromText(page, width, height);
    }

    const spot = placeFieldFromProfile(profile, width, height);
    if (!spot) return appended(`${detection}-insufficient-space`);

    return {
      pageIndex: pageCount - 1,
      onAppendedPage: false,
      left: spot.left,
      top: spot.top,
      width: FIELD_WIDTH,
      height: FIELD_HEIGHT,
      pageWidth: width,
      pageHeight: height,
      detection,
    };
  } finally {
    await loadingTask.destroy();
  }
}
