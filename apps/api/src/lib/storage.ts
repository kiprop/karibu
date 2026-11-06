import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError, randomToken } from './util.js';

/**
 * Private file storage for vendor documents. The local driver writes to disk (development).
 * In production use an S3-compatible bucket with no public access and short-lived signed URLs;
 * add that driver here behind the same function.
 */
export async function savePrivateFile(prefix: string, fileName: string, data: Buffer) {
  if (config.storage.driver !== 'local') throw new Error(`Storage driver ${config.storage.driver} is not implemented yet`);
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
  const key = `${prefix}/${randomToken(12)}-${safe}`;
  const full = path.resolve(config.storage.localDir, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export async function readPrivateFile(key: string) {
  if (config.storage.driver !== 'local') throw new Error(`Storage driver ${config.storage.driver} is not implemented yet`);
  const base = path.resolve(config.storage.localDir);
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error('Bad storage key');
  return readFile(full);
}

/**
 * Public images (listing photos). Only JPEG, PNG and WEBP, checked by their first bytes rather than
 * the name or the browser's claim. Stored under public/ and served by GET /v1/media/*.
 */
export function imageType(data: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (data.length > 12 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.length > 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export const MEDIA_PREFIX = '/api/media/';

export async function savePublicImage(prefix: string, data: Buffer) {
  if (config.storage.driver !== 'local') throw new Error(`Storage driver ${config.storage.driver} is not implemented yet`);
  const ext = imageType(data);
  if (!ext) throw new HttpError(400, 'Upload a JPG, PNG or WEBP photo');
  const key = `${prefix.replace(/[^A-Za-z0-9/_-]/g, '')}/${randomToken(12)}.${ext}`;
  const full = path.resolve(config.storage.localDir, 'public', key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return `${MEDIA_PREFIX}${key}`;
}

export async function readPublicImage(key: string) {
  if (config.storage.driver !== 'local') throw new Error(`Storage driver ${config.storage.driver} is not implemented yet`);
  const base = path.resolve(config.storage.localDir, 'public');
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep) || !/\.(jpg|png|webp)$/.test(full)) return null;
  return readFile(full).catch(() => null);
}
