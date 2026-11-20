# SignDesk: PDF Signing App

A full-stack, Zoho Sign–style document signing app. An administrator uploads a PDF and gets a private share link. Anyone with the link can view the document in the browser, sign it by drawing, typing or uploading a signature, and download the signed PDF. They don't need an account.

- **Frontend:** React 19, React Router 7, Tailwind CSS 4, pdf.js (rendered directly), signature_pad, Axios, Vite
- **Backend:** Node.js, Express 5, pdf-lib (embedding), pdf.js + @napi-rs/canvas (layout analysis), Multer, Helmet, express-rate-limit, JWT
- **Database:** MongoDB via Mongoose, **or** a built-in JSON file store (the default, so you don't need any infrastructure)

---

## Features

| Area | What you get |
|---|---|
| Admin upload (`/admin/upload/file`) | Drag-and-drop or browse. PDF-only validation (extension, MIME type and `%PDF-` magic bytes). Shows file name and size, upload progress and a cancel button. The success screen has a share link with Copy, WhatsApp and Email buttons. |
| Viewer (`/document/:id?t=…`) | Real PDF rendering on canvas (HiDPI, lazy-rendered pages). Page navigation and a page-number input, zoom in and out, fit to width, smooth scrolling, and a mobile layout with floating zoom controls. |
| Automatic signature field | The server rasterises the last page and finds blank space below the content (it skips footers such as page numbers). If the space is too small, or the page is rotated, it uses a **dedicated signature page** instead, so the field never overlaps existing content. |
| Signature modal | **Draw** (mouse, touch or stylus, with Undo, Clear and ink colour), **Type** (4 handwriting fonts with live preview), **Upload** (PNG or JPG with a preview and optional white-background removal). Every method produces a transparent PNG. |
| Finish & Submit | Requires a signature and an electronic-signature consent checkbox. The server embeds the signature at exact PDF coordinates, adds a "Signed by …, timestamp, transaction ID" caption and a **Certificate of Completion** audit page, and stores the signed PDF separately. The original file is never modified. |
| Admin dashboard | Stats, search, a Pending/Signed filter, and per document: copy link, preview, download original, download signed, delete (with confirmation). Shows view counts and signer details. |
| Security | Token-gated public links, JWT admin sessions in httpOnly SameSite=Strict cookies, rate limits, Helmet headers and CSP, file-signature checks, single-use signing lock, no leaked paths. See [Security](#security). |

---

## Quick start

**Requirements:** Node.js **22.13 or newer** (pdf.js 6 needs it) and npm 10 or newer. MongoDB is optional.

```bash
# 1. Install everything (root, backend, frontend)
npm run install:all

# 2. Configure the backend
cp backend/.env.example backend/.env
#    then edit backend/.env and set at least:
#      ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) and JWT_SECRET
#    (optional) cp frontend/.env.example frontend/.env

# 3. Run the API (port 5050) and web app (port 5173) together
npm run dev
```

Open **http://localhost:5173/admin/upload/file** and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `backend/.env`.

> **Note:** I created a local `backend/.env` for you with a random `JWT_SECRET`. The dev login is `admin` / `ChangeMe-Local-Dev-123`. Change it before you share the app with anyone.

### Run the two parts separately

```bash
cd backend  && npm run dev   # http://localhost:5050 (auto-restarts on change)
cd frontend && npm run dev   # http://localhost:5173 (proxies /api to :5050)
```

### Generate a hashed admin password (recommended)

```bash
cd backend
npm run hash-password -- "a-long-unique-password"
# copy the printed ADMIN_PASSWORD_HASH=... line into backend/.env and remove ADMIN_PASSWORD
```

### Use MongoDB instead of the JSON store

Set `MONGODB_URI=mongodb://127.0.0.1:27017/consent-app` in `backend/.env`. Nothing else changes. Without it, metadata lives in `backend/data/documents.json`, which is written atomically.

### Test on a phone on the same Wi-Fi

Vite listens on all interfaces. Open `http://<your-computer-ip>:5173`. Share links use the browser's origin, so links copied from that address also work on the phone. In the backend `.env`, leave `PUBLIC_APP_URL` empty or set it to that address.

---

## End-to-end workflow

1. The admin opens `/admin/upload/file`, signs in, and uploads a PDF.
2. The server validates the PDF, finds where the signature field goes, and saves the file as `uploads/<id>.pdf` along with its metadata. It also generates:
   - **Document ID**: `doc_<unix-timestamp>_<12 random chars>`
   - **Access token**: 256 random bits, base64url
3. The admin copies the link `https://host/document/doc_1734567890_a8f92kq0x3m1?t=<token>` and shares it.
4. The recipient opens the link and sees only that PDF, with a highlighted **"Click here to sign"** field at the end.
5. Clicking the field opens Draw / Type / Upload. **Apply Signature** places the signature in the field. It can still be changed until submission.
6. The recipient ticks the consent box and clicks **Finish & Submit**. The server writes `signed-documents/<id>_signed.pdf` and marks the document **Signed**.
7. The recipient sees a confirmation with the transaction ID and **Download signed PDF**. The viewer now shows the real signed PDF.
8. The admin dashboard shows the signer's name and time and offers the signed download.

### Automated tests

With the API running (`npm run dev`):

```bash
npm run test:e2e
```

This runs 21 API checks: auth, upload validation (a fake PDF and a wrong MIME type), field placement on the last page, the dedicated-page fallback for full and rotated pages, token isolation between documents, no leaked secrets, sign validation, duplicate-signature rejection, a byte-identical original, the page count of the signed PDF, admin listing, delete, and logout. The signed sample PDFs are written to a temp folder so you can inspect them.

---

## Project structure

```text
consent-application/
├── package.json                # root scripts: install:all, dev, build, start, test:e2e
├── backend/
│   ├── server.js               # Express app: Helmet/CSP, routes, optional static frontend
│   ├── config/index.js         # env parsing + validation (refuses unsafe prod config)
│   ├── routes/                 # admin.js (auth + management), documents.js (public, token-gated)
│   ├── controllers/            # authController, adminController, documentController, documentPresenter
│   ├── middleware/             # auth (JWT cookie), documentAccess (token check), rateLimiters, upload, errorHandler
│   ├── models/Document.js      # Mongoose schema
│   ├── services/
│   │   ├── documentStore.js    # MongoDB or JSON-file persistence (same interface)
│   │   ├── fileStorage.js      # originals vs signed copies, path-safe, write-once
│   │   ├── fileValidation.js   # PDF/PNG/JPG signature checks, filename sanitising
│   │   ├── ids.js              # secure IDs, tokens, transaction IDs, constant-time compare
│   │   ├── pdfLayout.js        # finds free space on the last page for the field
│   │   └── pdfSigner.js        # embeds signature + audit certificate with pdf-lib
│   ├── scripts/                # e2e-test.js, hash-password.js
│   ├── uploads/                # original PDFs (gitignored)
│   ├── signed-documents/       # signed PDFs (gitignored)
│   └── data/                   # JSON store (gitignored)
└── frontend/
    ├── vite.config.js          # dev proxy /api → :5050
    └── src/
        ├── App.jsx, main.jsx, index.css
        ├── components/
        │   ├── PDFViewer.jsx       # pdf.js viewer: toolbar, zoom, nav, lazy pages, overlays
        │   ├── SignatureBox.jsx    # the dashed field on the page
        │   ├── SignatureModal.jsx  # Draw / Type / Upload tabs
        │   ├── SignatureCanvas.jsx # signature_pad wrapper (HiDPI, resize-safe)
        │   ├── SignaturePage.jsx   # preview of the dedicated signature page
        │   ├── AdminLayout.jsx, RequireAdmin.jsx, CopyLinkButton.jsx, ui.jsx
        ├── pages/  AdminLogin, AdminUpload, AdminDashboard, DocumentSigning, NotFound
        ├── hooks/useAuth.jsx
        ├── lib/    pdfjs.js, signatureImage.js, format.js
        └── services/api.js
```

---

## REST API

Public endpoints need the document token, sent either as the `X-Document-Token` header or as the `?t=` query parameter. An admin session cookie also gives read access, so admins can preview. **Signing always requires the token.** An unknown ID and a wrong token both return the same `404`.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/admin/login` | none (rate limited) | `{username, password}` → sets httpOnly session cookie |
| POST | `/api/admin/logout` | none | Clears the session |
| GET | `/api/admin/me` | session | Current admin |
| POST | `/api/admin/upload` | session | `multipart/form-data` with field `file` (PDF) → document and share link |
| GET | `/api/admin/documents` | session | List all documents |
| GET | `/api/admin/documents/:id` | session | One document (including token and share link) |
| DELETE | `/api/admin/documents/:id` | session | Delete the document and its files |
| GET | `/api/documents/:id` | token or session | Public metadata: name, pages, status, signature field |
| GET | `/api/documents/:id/pdf` | token or session | Original PDF (`?download=1` to download it as an attachment) |
| POST | `/api/documents/:id/sign` | **token** (rate limited) | `{signerName, signerEmail?, signatureType, signatureImage (PNG data URL), consent: true}` |
| GET | `/api/documents/:id/signed-pdf` | token or session | Signed PDF (attachment; `?download=0` to view inline) |
| GET | `/api/health` | none | Health check |

### Signature field coordinates

`signatureField` is stored in **PDF points measured from the top-left of the visible page (crop box)**:

```json
{ "pageIndex": 1, "onAppendedPage": false, "left": 72, "top": 238, "width": 200, "height": 64,
  "pageWidth": 612, "pageHeight": 792, "detection": "render" }
```

- **Browser:** `cssPx = points × scale`, where `scale = renderedPageWidthPx / pageWidth`. The viewer positions the field this way, so the overlay sits exactly where the server will draw.
- **PDF:** `x = cropBox.x + left` and `y = cropBox.y + cropBox.height − top − height`, because PDF space has a bottom-left origin. Before drawing, the page's existing content is wrapped in `q … Q`, so leftover transformations in the original content can't move the signature.
- When `onAppendedPage` is true, `pageIndex === pageCount`. The signer sees a preview signature page, and the server adds the real page only to the signed copy.

---

## Security

- **Unguessable links.** Each document has a 256-bit random access token. IDs also carry about 62 random bits, so neither IDs nor timestamps are enough to get in. Tokens are compared in constant time, and a token only unlocks its own document.
- **Admin authentication.** Credentials come from the environment (bcrypt hash supported). Sessions are HS256 JWTs in `httpOnly`, `SameSite=Strict` cookies scoped to `/api`, marked `Secure` in production. Login is rate limited (10 failed attempts per 15 minutes). Every `/api/admin/*` route except login requires a session.
- **Upload hardening.** Uploads are buffered in memory with a size cap (`MAX_UPLOAD_MB`), one file only, and the MIME type, `.pdf` extension, `%PDF-` magic bytes and a full pdf-lib parse are all checked. Encrypted PDFs, damaged PDFs and PDFs over the page limit are rejected. Stored file names are derived only from the server ID. The user's file name is sanitised and used only for display.
- **Signature images.** These must be PNG data URLs. The server checks the PNG magic bytes, the IHDR dimensions (4000 px or less) and the size (`MAX_SIGNATURE_KB`), and the JSON body limit is 4 MB on the sign route only. The client also checks PNG/JPG magic bytes for uploads and re-encodes them.
- **One signature per document.** An atomic `pending → processing → signed` transition (a conditional update in MongoDB) rejects duplicate or concurrent submissions with `409`. If a crash leaves a document in `processing`, it is reset to `pending` on startup.
- **Originals stay unchanged.** Originals are written once (`wx`, mode `0400`) to `uploads/`, and signed copies go to `signed-documents/`. Before signing, the server checks the original's SHA-256, and the hash is recorded on the audit page.
- **Rate limits.** 600 requests per 15 minutes for the whole API, 300 per 15 minutes for public document routes, 10 sign attempts per 15 minutes, and 100 uploads per hour.
- **Headers.** Helmet is enabled with a strict CSP (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), HSTS, `Referrer-Policy: no-referrer` (so the token doesn't leak through Referer) and `Cache-Control: no-store` on the API.
- **No leaks.** Errors never include stack traces or file paths. Public responses never include tokens, hashes, IP addresses or storage names.
- **Production config.** The server refuses to start with `NODE_ENV=production` unless `JWT_SECRET` (32+ characters) and a strong password or hash are set.

---

## Deployment on Vercel (live)

| Project | URL | Source |
|---|---|---|
| `signdesk-app` (frontend) | https://signdesk-app.vercel.app | `frontend/` |
| `signdesk-api` (backend) | https://signdesk-api.vercel.app | `backend/` (Express as one serverless function, `api/index.js`) |

**How the two are linked.** `frontend/vercel.json` rewrites `/api/*` to `https://signdesk-api.vercel.app/api/*`. The browser only ever talks to `signdesk-app.vercel.app`, so the admin session cookie stays first-party. `*.vercel.app` subdomains count as separate sites, so calling the API directly would make it a blocked third-party cookie. The SPA fallback and the security headers (CSP, HSTS, `X-Frame-Options`, and others) are set in the same file.

**Storage.** Vercel has no persistent disk, so the backend requires `MONGODB_URI` there. Metadata goes in the `documents` collection, and PDFs go in the GridFS buckets `originals` and `signed`, which keeps them separate. The Atlas cluster's Network Access list must allow `0.0.0.0/0`, because Vercel has no static IP addresses.

**Environment variables.** Manage them with `vercel env` or in the dashboard.
- `signdesk-api`: `MONGODB_URI`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `MAX_UPLOAD_MB=4`, `PUBLIC_APP_URL=https://signdesk-app.vercel.app`, `TRUST_PROXY=true`
- `signdesk-app`: `VITE_MAX_UPLOAD_MB=4`

**Limits on Vercel.** Function requests and responses are capped at about 4.5 MB, so uploads are limited to 4 MB there. Rate-limit counters are kept in memory per function instance.

**Change the admin password:**
```bash
cd backend
npm run hash-password -- "new-password"          # prints ADMIN_PASSWORD_HASH=...
vercel env rm ADMIN_PASSWORD_HASH production -y
vercel env add ADMIN_PASSWORD_HASH production     # paste only the hash
vercel deploy --prod                               # env changes apply on the next deploy
```

### CI/CD pipeline (GitHub Actions)

`.github/workflows/ci-cd.yml` runs on every pull request and on every push to `main`:

1. **Build and E2E**, as a matrix over the `file` and `mongodb` storage drivers. It installs both apps, builds the frontend, starts the API (with a `mongo:7` service container for the GridFS path), and runs `npm run test:e2e`.
2. **Deploy**, on pushes to `main` (or a manual "Run workflow" on `main`) once the tests pass. For each project it runs `vercel pull`, then `vercel build --prod`, then `vercel deploy --prebuilt --prod`, and finally smoke-tests `https://signdesk-app.vercel.app`.

One-time setup: create a token at https://vercel.com/account/tokens and add it as the repository secret **`VERCEL_TOKEN`** (Settings → Secrets and variables → Actions). The Vercel org and project IDs are defaults in the workflow, and repository variables `VERCEL_ORG_ID`, `VERCEL_BACKEND_PROJECT_ID` and `VERCEL_FRONTEND_PROJECT_ID` override them. Without the token, the deploy job is skipped with a warning.

## Self-hosted production deployment

Run everything on one origin (the simplest setup):

```bash
npm run build      # builds frontend/dist
npm start          # NODE_ENV=production, SERVE_FRONTEND=true, serves the SPA and API on PORT
```

- Put it behind HTTPS (nginx, Caddy, or a platform load balancer) and set `TRUST_PROXY=1` so client IPs and rate limits are correct. The CSP includes `upgrade-insecure-requests`, and cookies are `Secure` in production, so plain HTTP only works on `localhost`.
- Set `PUBLIC_APP_URL=https://your-domain.com` so the API's `shareUrl` field is correct.
- Keep `uploads/`, `signed-documents/` and `data/` on persistent storage and back them up, or use MongoDB for metadata.
- **Split hosting** (frontend on a CDN): build with `VITE_API_URL=https://api.your-domain.com` and set `CORS_ORIGINS=https://your-domain.com` on the API. Cross-site cookies also need `SameSite=None`, so the single-origin setup is recommended.

---

## Configuration reference

**backend/.env:** `PORT`, `NODE_ENV`, `PUBLIC_APP_URL`, `TRUST_PROXY`, `CORS_ORIGINS`, `SERVE_FRONTEND`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` / `ADMIN_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `MONGODB_URI`, `UPLOADS_DIR`, `SIGNED_DIR`, `DATA_DIR`, `MAX_UPLOAD_MB`, `MAX_SIGNATURE_KB`, `MAX_PAGES`. Each one is documented in `backend/.env.example`.

**frontend/.env:** `VITE_API_URL`, `VITE_PUBLIC_APP_URL`, `VITE_API_PROXY_TARGET`, and optionally `VITE_MAX_UPLOAD_MB`.

> Port 5050 is the API default because 4000 is often taken. If you change `PORT`, also set `VITE_API_PROXY_TARGET`.

---

## Notes and limitations

- Each document has one signer and one signature field, and a signed document can't be signed again.
- The JSON file store is for **one server process only**. If you run several instances or replicas, use `MONGODB_URI`.
- The small "Signed by …" caption and the audit page use the standard PDF Helvetica font. Characters outside Latin-1 (for example CJK) in a signer's name show as `?` in that caption only. The signature itself is an image, so typed signatures in any script come through correctly.
- The e-signature consent text and the audit certificate are generic. Check them against the e-signature law that applies to you (ESIGN/UETA, eIDAS, or the IT Act 2000) before using this for legally binding agreements.
