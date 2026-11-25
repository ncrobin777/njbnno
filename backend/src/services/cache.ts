import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR = path.resolve(process.cwd(), 'cache');
const KEY_FILE = path.join(CACHE_DIR, '.cache_key');

interface CacheEntry<T> {
  timestamp: number;
  ttlMs: number;
  data: T;
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getEncryptionKey(): Buffer {
  ensureCacheDir();
  if (process.env.CACHE_SECRET) {
    return crypto.createHash('sha256').update(process.env.CACHE_SECRET).digest();
  }
  if (fs.existsSync(KEY_FILE)) {
    const hex = fs.readFileSync(KEY_FILE, 'utf-8').trim();
    if (hex.length === 64) return Buffer.from(hex, 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

function encryptText(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  });
}

function decryptText(raw: string): string {
  const parsed = JSON.parse(raw);
  if (parsed && parsed.v === 1 && parsed.iv && parsed.tag && parsed.data) {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(parsed.iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
  return raw;
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getCached<T>(key: string): { data: T; cachedAt: string } | null {
  ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const decrypted = decryptText(raw);
    const entry = JSON.parse(decrypted) as CacheEntry<T>;
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttlMs) {
      fs.unlinkSync(filePath);
      return null;
    }
    return {
      data: entry.data,
      cachedAt: new Date(entry.timestamp).toISOString(),
    };
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, data: T, ttlMinutes = 20): string {
  ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);
  const now = Date.now();
  const entry: CacheEntry<T> = {
    timestamp: now,
    ttlMs: ttlMinutes * 60 * 1000,
    data,
  };
  fs.writeFileSync(filePath, encryptText(JSON.stringify(entry)), 'utf-8');
  return new Date(now).toISOString();
}

export function clearCacheKey(key: string): void {
  const filePath = path.join(CACHE_DIR, `${sanitizeKey(key)}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
