import mongoose from 'mongoose';

const signatureFieldSchema = new mongoose.Schema(
  {
    // 0-based index of the page holding the field; equals pageCount when the
    // field lives on a dedicated signature page appended after the document.
    pageIndex: { type: Number, required: true },
    onAppendedPage: { type: Boolean, default: false },
    // Geometry in PDF points, measured from the TOP-LEFT of the visible page.
    left: Number,
    top: Number,
    width: Number,
    height: Number,
    pageWidth: Number,
    pageHeight: Number,
    detection: String,
  },
  { _id: false },
);

const signingSchema = new mongoose.Schema(
  {
    signerName: String,
    signerEmail: String,
    signatureType: { type: String, enum: ['draw', 'type', 'upload'] },
    signedAt: Date,
    transactionId: String,
    ip: String,
    userAgent: String,
    signedSha256: String,
    signedSize: Number,
    signedFile: String,
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    accessToken: { type: String, required: true, index: true },
    originalName: { type: String, required: true },
    storedFile: { type: String, required: true },
    size: Number,
    pageCount: Number,
    sha256: String,
    status: { type: String, enum: ['pending', 'processing', 'signed'], default: 'pending', index: true },
    signatureField: signatureFieldSchema,
    firstViewedAt: Date,
    lastViewedAt: Date,
    viewCount: { type: Number, default: 0 },
    signing: signingSchema,
  },
  { timestamps: true, versionKey: false },
);

export const DocumentModel = mongoose.models.Document || mongoose.model('Document', documentSchema);
