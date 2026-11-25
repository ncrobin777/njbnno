import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeBaseUrl } from './jiraClient.js';
import { setCached, getCached, clearCacheKey } from './cache.js';

describe('Security: SSRF Protection (normalizeBaseUrl)', () => {
  it('blocks localhost, private IPs, metadata IPs, HTTP, and non-Atlassian domains', () => {
    expect(() => normalizeBaseUrl('http://169.254.169.254/latest/meta-data')).toThrow();
    expect(() => normalizeBaseUrl('https://127.0.0.1:3001')).toThrow();
    expect(() => normalizeBaseUrl('https://localhost:8080')).toThrow();
    expect(() => normalizeBaseUrl('http://ncrobin777.atlassian.net')).toThrow();
    expect(() => normalizeBaseUrl('https://evil-attacker.com')).toThrow();
    expect(() => normalizeBaseUrl('https://internal.service.local')).toThrow();
  });

  it('accepts valid *.atlassian.net HTTPS URLs and strips extra paths', () => {
    expect(normalizeBaseUrl('https://ncrobin777.atlassian.net')).toBe(
      'https://ncrobin777.atlassian.net'
    );
    expect(
      normalizeBaseUrl('https://ncrobin777.atlassian.net/jira/software/projects/SAG/boards/1')
    ).toBe('https://ncrobin777.atlassian.net');
  });
});

describe('Security: Encrypted Cache at Rest', () => {
  const testKey = 'sec_test_encrypted_entry';

  afterEach(() => {
    clearCacheKey(testKey);
  });

  it('encrypts cached payloads on disk and decrypts them cleanly', () => {
    const secretPayload = { ticket: 'SAG-999', note: 'Confidential sprint data' };
    setCached(testKey, secretPayload, 10);

    const cacheFile = path.resolve(process.cwd(), 'cache', `${testKey}.json`);
    const rawOnDisk = fs.readFileSync(cacheFile, 'utf-8');
    expect(rawOnDisk).not.toContain('Confidential sprint data');
    expect(rawOnDisk).not.toContain('SAG-999');

    const parsed = JSON.parse(rawOnDisk);
    expect(parsed.v).toBe(1);
    expect(parsed.iv).toBeTruthy();
    expect(parsed.tag).toBeTruthy();

    const decrypted = getCached<typeof secretPayload>(testKey);
    expect(decrypted?.data).toEqual(secretPayload);
  });
});
