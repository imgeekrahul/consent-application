import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import config from '../config/index.js';

/**
 * Binary storage for PDFs. Originals and signed copies are always kept apart:
 *   - Disk driver (default): `uploads/` and `signed-documents/`
 *   - GridFS driver (when MONGODB_URI is set — required on serverless hosts
 *     like Vercel, which have no persistent disk): buckets `originals` and `signed`
 *
 * Names are derived from the server-generated document ID only — never from
 * user input — and are never exposed to clients. Files are write-once.
 */
const SAFE_NAME = /^doc_[a-z0-9_]+\.pdf$/;

function assertSafe(name) {
  if (!SAFE_NAME.test(name)) throw new Error('Unsafe storage file name');
}

class FileExistsError extends Error {}

const diskDriver = {
  dir: { original: config.uploadsDir, signed: config.signedDir },
  async init() {
    await fs.mkdir(this.dir.original, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.dir.signed, { recursive: true, mode: 0o700 });
  },
  resolve(kind, name) {
    assertSafe(name);
    const dir = path.resolve(this.dir[kind]);
    const full = path.resolve(dir, name);
    if (path.dirname(full) !== dir) throw new Error('Path traversal blocked');
    return full;
  },
  async write(kind, name, buffer) {
    // 'wx' refuses to overwrite: an original can never be replaced.
    try {
      await fs.writeFile(this.resolve(kind, name), buffer, { flag: 'wx', mode: 0o400 });
    } catch (err) {
      if (err.code === 'EEXIST') throw new FileExistsError(name);
      throw err;
    }
  },
  read(kind, name) {
    return fs.readFile(this.resolve(kind, name));
  },
  async remove(kind, name) {
    try {
      await fs.unlink(this.resolve(kind, name));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  },
};

const gridFsDriver = {
  buckets: null,
  async init() {
    const { db } = mongoose.connection;
    if (!db) throw new Error('MongoDB is not connected');
    this.buckets = {
      original: new mongoose.mongo.GridFSBucket(db, { bucketName: 'originals' }),
      signed: new mongoose.mongo.GridFSBucket(db, { bucketName: 'signed' }),
    };
    await db.collection('originals.files').createIndex({ filename: 1 }, { unique: true });
    await db.collection('signed.files').createIndex({ filename: 1 }, { unique: true });
  },
  async write(kind, name, buffer) {
    assertSafe(name);
    const bucket = this.buckets[kind];
    if (await bucket.find({ filename: name }).limit(1).hasNext()) throw new FileExistsError(name);
    await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(name, { metadata: { contentType: 'application/pdf' } });
      upload.once('finish', resolve);
      upload.once('error', reject);
      upload.end(buffer);
    });
  },
  async read(kind, name) {
    assertSafe(name);
    const chunks = [];
    for await (const chunk of this.buckets[kind].openDownloadStreamByName(name)) chunks.push(chunk);
    return Buffer.concat(chunks);
  },
  async remove(kind, name) {
    assertSafe(name);
    const bucket = this.buckets[kind];
    for await (const file of bucket.find({ filename: name })) await bucket.delete(file._id);
  },
};

const driver = config.mongoUri ? gridFsDriver : diskDriver;

export const storageDriverName = config.mongoUri ? 'gridfs' : 'disk';
export const initFileStorage = () => driver.init();

export const saveOriginal = (name, buffer) => driver.write('original', name, buffer);
export const saveSigned = (name, buffer) => driver.write('signed', name, buffer);
export const readOriginal = (name) => driver.read('original', name);
export const readSigned = (name) => driver.read('signed', name);

export async function deleteFiles(doc) {
  await driver.remove('original', doc.storedFile);
  if (doc.signing?.signedFile) await driver.remove('signed', doc.signing.signedFile);
}
