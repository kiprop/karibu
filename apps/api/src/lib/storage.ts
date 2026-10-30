import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { randomToken } from './util.js';

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
