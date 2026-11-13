import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hasher.js';

describe('Argon2id password hashing', () => {
  it('stores a one-way Argon2id digest and verifies only the matching password', async () => {
    const digest = await hashPassword('correct horse battery staple');
    expect(digest.startsWith('$argon2id$')).toBe(true);
    expect(digest).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', digest)).resolves.toBe(true);
    await expect(verifyPassword('incorrect password', digest)).resolves.toBe(false);
  });

  it('rejects malformed and non-Argon2 digests safely', async () => {
    await expect(verifyPassword('password', 'scrypt$bad')).resolves.toBe(false);
  });
});
