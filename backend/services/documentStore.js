import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import config from '../config/index.js';
import { DocumentModel } from '../models/Document.js';

/**
 * Persistence for document metadata. Two interchangeable back-ends share one
 * interface:
 *   - MongoDB (when MONGODB_URI is set) via Mongoose
 *   - A JSON file store (default) so the app runs with zero infrastructure
 *
 * Records are plain objects with an `id` field.
 */

const clone = (v) => (v === undefined ? v : structuredClone(v));

class FileStore {
  constructor(dir) {
    this.file = path.join(dir, 'documents.json');
    this.docs = new Map();
    this.writing = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
      for (const doc of raw.documents || []) this.docs.set(doc.id, doc);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    // A crash mid-signing must not leave a document permanently locked.
    let dirty = false;
    for (const doc of this.docs.values()) {
      if (doc.status === 'processing') { doc.status = 'pending'; dirty = true; }
    }
    if (dirty) await this.persist();
    return 'json-file';
  }

  persist() {
    const snapshot = JSON.stringify({ documents: [...this.docs.values()] }, null, 2);
    const tmp = `${this.file}.${process.pid}.tmp`;
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        await fs.writeFile(tmp, snapshot, { mode: 0o600 });
        await fs.rename(tmp, this.file);
      });
    return this.writing;
  }

  async create(doc) {
    const now = new Date().toISOString();
    const record = { viewCount: 0, ...doc, createdAt: now, updatedAt: now };
    this.docs.set(record.id, record);
    await this.persist();
    return clone(record);
  }

  async get(id) {
    return clone(this.docs.get(id)) ?? null;
  }

  async list() {
    return [...this.docs.values()]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(clone);
  }

  async update(id, patch) {
    const doc = this.docs.get(id);
    if (!doc) return null;
    Object.assign(doc, clone(patch), { updatedAt: new Date().toISOString() });
    await this.persist();
    return clone(doc);
  }

  /** Atomically applies `patch` only if the document's status equals `fromStatus`. */
  async transition(id, fromStatus, patch) {
    const doc = this.docs.get(id);
    if (!doc || doc.status !== fromStatus) return null;
    return this.update(id, patch);
  }

  async recordView(id) {
    const doc = this.docs.get(id);
    if (!doc) return;
    const now = new Date().toISOString();
    doc.firstViewedAt ??= now;
    doc.lastViewedAt = now;
    doc.viewCount = (doc.viewCount || 0) + 1;
    await this.persist();
  }

  async remove(id) {
    const existed = this.docs.delete(id);
    if (existed) await this.persist();
    return existed;
  }
}

function fromMongo(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  const toIso = (d) => (d instanceof Date ? d.toISOString() : d);
  const out = { id: _id, ...rest };
  for (const k of ['createdAt', 'updatedAt', 'firstViewedAt', 'lastViewedAt']) out[k] = toIso(out[k]);
  if (out.signing?.signedAt) out.signing.signedAt = toIso(out.signing.signedAt);
  return out;
}

class MongoStore {
  async init() {
    mongoose.set('strictQuery', true);
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 });
    }
    await DocumentModel.updateMany({ status: 'processing' }, { $set: { status: 'pending' } });
    return 'mongodb';
  }

  async create({ id, ...doc }) {
    const created = await DocumentModel.create({ _id: id, ...doc });
    return fromMongo(created.toObject());
  }

  async get(id) {
    return fromMongo(await DocumentModel.findById(id).lean());
  }

  async list() {
    return (await DocumentModel.find().sort({ createdAt: -1 }).lean()).map(fromMongo);
  }

  async update(id, patch) {
    return fromMongo(await DocumentModel.findByIdAndUpdate(id, { $set: patch }, { returnDocument: 'after', lean: true }));
  }

  async transition(id, fromStatus, patch) {
    return fromMongo(
      await DocumentModel.findOneAndUpdate({ _id: id, status: fromStatus }, { $set: patch }, { returnDocument: 'after', lean: true }),
    );
  }

  async recordView(id) {
    const now = new Date();
    await DocumentModel.updateOne({ _id: id }, { $inc: { viewCount: 1 }, $set: { lastViewedAt: now } });
    await DocumentModel.updateOne({ _id: id, firstViewedAt: null }, { $set: { firstViewedAt: now } });
  }

  async remove(id) {
    const res = await DocumentModel.deleteOne({ _id: id });
    return res.deletedCount > 0;
  }
}

const store = config.mongoUri ? new MongoStore() : new FileStore(config.dataDir);
export default store;
