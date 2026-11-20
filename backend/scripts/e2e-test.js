/**
 * End-to-end API test: login → upload → public view → sign → download → admin list → delete.
 *
 * Start the API first (`npm run dev`), then run:
 *   npm run test:e2e
 * Environment: API_URL (default http://localhost:5050), ADMIN_USERNAME, ADMIN_PASSWORD.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import config from '../config/index.js';

const API = (process.env.API_URL || `http://localhost:${config.port}`) + '/api';
const USER = process.env.ADMIN_USERNAME || config.admin.username;
const PASS = process.env.E2E_ADMIN_PASSWORD || config.admin.password;

let cookie = '';
const results = [];

async function step(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log(`  ✔ ${name}`);
  } catch (err) {
    results.push(['FAIL', name]);
    console.log(`  ✘ ${name}\n      ${err.message}`);
  }
}

async function call(method, url, { body, headers = {}, auth = true } = {}) {
  const res = await fetch(API + url, {
    method,
    headers: { ...(auth && cookie ? { cookie } : {}), ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

async function makePdf({ pages, linesOnLast, rotateLast = false, footer = true }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([612, 792]);
    const lines = p === pages - 1 ? linesOnLast : 44;
    for (let i = 0; i < lines; i++) {
      page.drawText(`Page ${p + 1}, line ${i + 1}: The parties agree to the terms set out in this agreement.`, { x: 72, y: 730 - i * 15, size: 10.5, font });
    }
    if (footer) page.drawText(`Page ${p + 1} of ${pages}`, { x: 280, y: 30, size: 9, font });
    if (rotateLast && p === pages - 1) page.setRotation(degrees(90));
  }
  return Buffer.from(await doc.save());
}

function makeSignaturePng() {
  const canvas = createCanvas(600, 200);
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(40, 150);
  ctx.bezierCurveTo(120, 20, 200, 180, 300, 80);
  ctx.bezierCurveTo(380, 10, 450, 170, 560, 60);
  ctx.stroke();
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

function upload(buffer, name, type = 'application/pdf') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  return call('POST', '/admin/upload', { body: form });
}

console.log(`\nE2E against ${API}\n`);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'consent-e2e-'));

await step('rejects admin API without a session', async () => {
  const r = await call('GET', '/admin/documents', { auth: false });
  assert.equal(r.status, 401);
});

await step('rejects wrong password', async () => {
  const r = await call('POST', '/admin/login', { body: { username: USER, password: 'wrong-password' }, auth: false });
  assert.equal(r.status, 401);
});

await step('admin login', async () => {
  assert.ok(PASS, 'Set E2E_ADMIN_PASSWORD (or ADMIN_PASSWORD in .env)');
  const r = await call('POST', '/admin/login', { body: { username: USER, password: PASS } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(cookie.startsWith('cs_admin='));
});

await step('rejects non-PDF content disguised as PDF', async () => {
  const r = await upload(Buffer.from('<html>not a pdf</html>'), 'evil.pdf');
  assert.equal(r.status, 415, JSON.stringify(r.data));
});

await step('rejects non-PDF MIME type', async () => {
  const r = await upload(Buffer.from('hello'), 'notes.txt', 'text/plain');
  assert.equal(r.status, 415);
});

let doc;
let fullDoc;
let rotatedDoc;
const shortPdf = await makePdf({ pages: 2, linesOnLast: 12 });

await step('upload PDF with room on the last page → field on last page', async () => {
  const r = await upload(shortPdf, 'Service Agreement – Ünïcode.pdf');
  assert.equal(r.status, 201, JSON.stringify(r.data));
  doc = r.data.document;
  assert.match(doc.id, /^doc_\d+_[a-z0-9]{12}$/);
  assert.equal(doc.accessToken.length, 43);
  assert.equal(doc.name, 'Service Agreement – Ünïcode.pdf');
  assert.equal(doc.pageCount, 2);
  assert.equal(doc.signatureField.onAppendedPage, false);
  assert.equal(doc.signatureField.pageIndex, 1);
  // 12 lines end around y = 62 + 11*15 ≈ 235pt from top.
  assert.ok(doc.signatureField.top > 230 && doc.signatureField.top < 300, `top=${doc.signatureField.top}`);
});

await step('upload full last page → dedicated signature page', async () => {
  const r = await upload(await makePdf({ pages: 1, linesOnLast: 46 }), 'full.pdf');
  assert.equal(r.status, 201);
  fullDoc = r.data.document;
  assert.equal(fullDoc.signatureField.onAppendedPage, true);
  assert.equal(fullDoc.signatureField.pageIndex, 1);
});

await step('upload rotated last page → dedicated signature page', async () => {
  const r = await upload(await makePdf({ pages: 1, linesOnLast: 5, rotateLast: true }), 'rotated.pdf');
  assert.equal(r.status, 201);
  rotatedDoc = r.data.document;
  assert.equal(rotatedDoc.signatureField.onAppendedPage, true);
});

await step('public metadata requires the right token', async () => {
  assert.equal((await call('GET', `/documents/${doc.id}`, { auth: false })).status, 404);
  assert.equal((await call('GET', `/documents/${doc.id}?t=${'x'.repeat(43)}`, { auth: false })).status, 404);
  assert.equal((await call('GET', `/documents/${doc.id}?t=${fullDoc.accessToken}`, { auth: false })).status, 404, 'token of another doc must not work');
  const r = await call('GET', `/documents/${doc.id}`, { auth: false, headers: { 'x-document-token': doc.accessToken } });
  assert.equal(r.status, 200);
  assert.equal(r.data.document.status, 'pending');
  assert.equal(r.data.document.accessToken, undefined, 'token must not leak');
  assert.equal(r.data.document.storedFile, undefined, 'storage name must not leak');
});

await step('public can fetch original PDF', async () => {
  const r = await call('GET', `/documents/${doc.id}/pdf?t=${doc.accessToken}`, { auth: false });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.ok(r.data.equals(shortPdf), 'served bytes must equal the upload');
});

await step('public cannot use admin endpoints with a document token', async () => {
  const r = await call('GET', `/admin/documents?t=${doc.accessToken}`, { auth: false });
  assert.equal(r.status, 401);
  const d = await call('DELETE', `/admin/documents/${doc.id}`, { auth: false, headers: { 'x-document-token': doc.accessToken } });
  assert.equal(d.status, 401);
});

await step('signed PDF unavailable before signing', async () => {
  const r = await call('GET', `/documents/${doc.id}/signed-pdf?t=${doc.accessToken}`, { auth: false });
  assert.equal(r.status, 404);
});

const signature = makeSignaturePng();

await step('sign validation: name, consent, image', async () => {
  const base = { signerName: 'Jane Doe', signatureType: 'draw', signatureImage: signature, consent: true };
  const url = `/documents/${doc.id}/sign?t=${doc.accessToken}`;
  assert.equal((await call('POST', url, { auth: false, body: { ...base, signerName: 'J' } })).status, 400);
  assert.equal((await call('POST', url, { auth: false, body: { ...base, consent: false } })).status, 400);
  assert.equal((await call('POST', url, { auth: false, body: { ...base, signatureImage: 'data:image/png;base64,AAAA' } })).status, 400);
  assert.equal((await call('POST', url, { auth: false, body: { ...base, signerEmail: 'nope' } })).status, 400);
});

await step('sign document', async () => {
  const r = await call('POST', `/documents/${doc.id}/sign?t=${doc.accessToken}`, {
    auth: false,
    body: { signerName: 'Jane Doe', signerEmail: 'jane@example.com', signatureType: 'draw', signatureImage: signature, consent: true },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.document.status, 'signed');
  assert.match(r.data.document.signing.transactionId, /^TXN-\d{8}-[A-Z0-9]{12}$/);
});

await step('duplicate signature is rejected', async () => {
  const r = await call('POST', `/documents/${doc.id}/sign?t=${doc.accessToken}`, {
    auth: false,
    body: { signerName: 'Mallory', signatureType: 'type', signatureImage: signature, consent: true },
  });
  assert.equal(r.status, 409);
});

await step('signed PDF has signature embedded + audit page; original unchanged', async () => {
  const r = await call('GET', `/documents/${doc.id}/signed-pdf?t=${doc.accessToken}`, { auth: false });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  const signed = await PDFDocument.load(r.data);
  assert.equal(signed.getPageCount(), 3, 'original 2 pages + certificate');
  await fs.writeFile(path.join(tmp, 'signed-last-page.pdf'), r.data);
  const original = await call('GET', `/documents/${doc.id}/pdf?t=${doc.accessToken}`, { auth: false });
  assert.ok(original.data.equals(shortPdf), 'original must be byte-identical');
});

await step('signing on a dedicated signature page', async () => {
  const s = await call('POST', `/documents/${fullDoc.id}/sign?t=${fullDoc.accessToken}`, {
    auth: false,
    body: { signerName: 'Zoë Ålvarez 李', signatureType: 'type', signatureImage: signature, consent: true },
  });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const r = await call('GET', `/documents/${fullDoc.id}/signed-pdf?t=${fullDoc.accessToken}`, { auth: false });
  const signed = await PDFDocument.load(r.data);
  assert.equal(signed.getPageCount(), 3, 'original + signature page + certificate');
  await fs.writeFile(path.join(tmp, 'signed-appended-page.pdf'), r.data);
});

await step('admin list shows statuses', async () => {
  const r = await call('GET', '/admin/documents');
  assert.equal(r.status, 200);
  const byId = Object.fromEntries(r.data.documents.map((d) => [d.id, d]));
  assert.equal(byId[doc.id].status, 'signed');
  assert.equal(byId[doc.id].signing.signerName, 'Jane Doe');
  assert.equal(byId[rotatedDoc.id].status, 'pending');
  assert.ok(byId[doc.id].viewCount >= 1);
});

await step('admin can read documents without token', async () => {
  const r = await call('GET', `/documents/${rotatedDoc.id}/pdf`);
  assert.equal(r.status, 200);
});

await step('delete documents', async () => {
  for (const d of [doc, fullDoc, rotatedDoc]) {
    assert.equal((await call('DELETE', `/admin/documents/${d.id}`)).status, 200);
  }
  assert.equal((await call('GET', `/documents/${doc.id}?t=${doc.accessToken}`, { auth: false })).status, 404);
});

await step('logout ends session', async () => {
  await call('POST', '/admin/logout');
  cookie = '';
  assert.equal((await call('GET', '/admin/me')).status, 401);
});

const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed. Signed sample PDFs written to ${tmp}\n`);
process.exit(failed ? 1 : 0);
