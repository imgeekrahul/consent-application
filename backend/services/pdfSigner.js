import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState } from 'pdf-lib';

const BLUE = rgb(0.086, 0.396, 0.851);
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.82, 0.85, 0.89);

/** Standard PDF fonts only cover WinAnsi; replace anything else so drawing never throws. */
function safeText(font, text) {
  let out = '';
  for (const ch of String(text ?? '')) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

function wrapText(font, text, size, maxWidth) {
  const words = safeText(font, text).split(/(\s+)/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line + word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line.trim());
      line = word.trimStart();
    }
    // Hard-break single tokens that are wider than the line (e.g. long file names).
    while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function formatUtc(iso) {
  const d = new Date(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)} UTC`;
}

/**
 * Isolates the page's existing content in q/Q so any graphics state it leaves
 * behind (e.g. a transformed CTM) can't shift what we draw on top.
 */
function isolateExistingContent(pdfDoc, page) {
  const start = pdfDoc.context.register(pdfDoc.context.contentStream([pushGraphicsState()]));
  const end = pdfDoc.context.register(pdfDoc.context.contentStream([popGraphicsState()]));
  page.node.wrapContentStreams(start, end);
}

function drawSignaturePageHeader(page, fonts, { documentName, pageWidth, pageHeight }) {
  const { regular, bold } = fonts;
  const left = 72;
  let y = pageHeight - 72;
  page.drawRectangle({ x: 0, y: pageHeight - 8, width: pageWidth, height: 8, color: BLUE });
  page.drawText('Signature Page', { x: left, y, size: 20, font: bold, color: INK });
  y -= 22;
  const lines = wrapText(regular, `This page was added to capture the signature for "${documentName}".`, 10.5, pageWidth - 144);
  for (const line of lines.slice(0, 3)) {
    page.drawText(line, { x: left, y, size: 10.5, font: regular, color: MUTED });
    y -= 15;
  }
  page.drawLine({ start: { x: left, y: y - 6 }, end: { x: pageWidth - 72, y: y - 6 }, thickness: 0.75, color: LINE });
}

function drawAuditPage(pdfDoc, fonts, info, signatureImage) {
  const { regular, bold } = fonts;
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const left = 60;
  const right = width - 60;
  let y = height - 70;

  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: BLUE });
  page.drawText('Certificate of Completion', { x: left, y, size: 20, font: bold, color: INK });
  y -= 20;
  page.drawText('Electronic signature audit trail', { x: left, y, size: 10.5, font: regular, color: MUTED });
  y -= 24;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 26;

  const section = (title) => {
    page.drawText(title.toUpperCase(), { x: left, y, size: 8.5, font: bold, color: BLUE });
    y -= 18;
  };
  const row = (label, value) => {
    page.drawText(safeText(bold, label), { x: left, y, size: 9.5, font: bold, color: MUTED });
    const lines = wrapText(regular, value || '—', 9.5, right - (left + 150));
    for (const line of lines) {
      page.drawText(line, { x: left + 150, y, size: 9.5, font: regular, color: INK });
      y -= 14;
    }
    y -= 4;
  };

  section('Document');
  row('Document name', info.documentName);
  row('Document ID', info.documentId);
  row('Pages (original)', String(info.pageCount));
  row('Original SHA-256', info.originalSha256);
  row('Uploaded', formatUtc(info.createdAt));
  y -= 10;

  section('Signer');
  row('Name', info.signerName);
  row('Email', info.signerEmail || 'Not provided');
  row('Signature method', { draw: 'Drawn', type: 'Typed', upload: 'Uploaded image' }[info.signatureType] || info.signatureType);
  row('IP address', info.ip || 'Unknown');
  row('User agent', (info.userAgent || 'Unknown').slice(0, 300));
  y -= 10;

  section('Event history');
  row('Document created', formatUtc(info.createdAt));
  if (info.firstViewedAt) row('First viewed', formatUtc(info.firstViewedAt));
  row('Signed', formatUtc(info.signedAt));
  row('Transaction ID', info.transactionId);
  y -= 10;

  section('Signature');
  const box = { x: left, y: y - 70, w: 220, h: 70 };
  page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, borderColor: LINE, borderWidth: 0.75 });
  const scaled = signatureImage.scaleToFit(box.w - 16, box.h - 16);
  page.drawImage(signatureImage, {
    x: box.x + (box.w - scaled.width) / 2,
    y: box.y + (box.h - scaled.height) / 2,
    width: scaled.width,
    height: scaled.height,
  });
  y = box.y - 30;

  const note = wrapText(
    regular,
    'The signer agreed to use an electronic signature and confirmed the document contents before signing. '
      + 'This certificate was generated automatically and forms part of the signed document.',
    8.5,
    right - left,
  );
  for (const line of note) {
    page.drawText(line, { x: left, y, size: 8.5, font: regular, color: MUTED });
    y -= 12;
  }
}

/**
 * Produces a new signed PDF. The original bytes are only read, never written.
 *
 * @param {Buffer} originalBytes
 * @param {object} doc     document record (needs signatureField)
 * @param {Buffer} signaturePng
 * @param {object} info    audit details
 */
export async function createSignedPdf(originalBytes, doc, signaturePng, info) {
  const pdfDoc = await PDFDocument.load(originalBytes, { updateMetadata: false });
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const signature = await pdfDoc.embedPng(signaturePng);
  const field = doc.signatureField;

  let page;
  let box;
  if (field.onAppendedPage) {
    page = pdfDoc.addPage([field.pageWidth, field.pageHeight]);
    drawSignaturePageHeader(page, fonts, {
      documentName: doc.originalName,
      pageWidth: field.pageWidth,
      pageHeight: field.pageHeight,
    });
    box = { x: 0, y: 0, width: field.pageWidth, height: field.pageHeight };
  } else {
    page = pdfDoc.getPage(field.pageIndex);
    isolateExistingContent(pdfDoc, page);
    box = page.getCropBox();
  }

  // Convert top-left based field geometry into PDF user space (bottom-left origin).
  const fx = box.x + field.left;
  const fy = box.y + box.height - field.top - field.height;

  if (field.onAppendedPage) {
    page.drawText('Signature', { x: fx, y: fy + field.height + 8, size: 9, font: fonts.bold, color: MUTED });
  }

  const pad = 4;
  const fit = signature.scaleToFit(field.width - pad * 2, field.height - pad * 2);
  page.drawImage(signature, {
    x: fx + pad,
    y: fy + pad + (field.height - pad * 2 - fit.height) / 2,
    width: fit.width,
    height: fit.height,
  });
  page.drawLine({ start: { x: fx, y: fy }, end: { x: fx + field.width, y: fy }, thickness: 0.75, color: MUTED });
  page.drawText(safeText(fonts.bold, `Signed by ${info.signerName}`).slice(0, 60), {
    x: fx, y: fy - 10, size: 7.5, font: fonts.bold, color: INK,
  });
  page.drawText(`${formatUtc(info.signedAt)}  ·  ${info.transactionId}`, {
    x: fx, y: fy - 20, size: 6.5, font: fonts.regular, color: MUTED,
  });

  drawAuditPage(pdfDoc, fonts, info, signature);
  pdfDoc.setModificationDate(new Date(info.signedAt));
  return Buffer.from(await pdfDoc.save());
}
