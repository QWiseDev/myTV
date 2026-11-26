/**
 * @jest-environment node
 */

import { hashPassword, isPasswordHash, verifyPassword } from './password';

describe('password hashing', () => {
  test('hashes passwords with unique per-password scrypt salts and verifies them', async () => {
    const hash1 = await hashPassword('SuperSecret#2026');
    const hash2 = await hashPassword('SuperSecret#2026');

    expect(isPasswordHash(hash1)).toBe(true);
    expect(isPasswordHash(hash2)).toBe(true);
    expect(hash1).not.toBe(hash2);

    await expect(verifyPassword('SuperSecret#2026', hash1)).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
    await expect(verifyPassword('WrongPassword', hash1)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  test('verifies legacy plaintext passwords and flags needsRehash', async () => {
    await expect(verifyPassword('legacy-pass', 'legacy-pass')).resolves.toEqual(
      {
        valid: true,
        needsRehash: true,
      },
    );
    await expect(verifyPassword('bad-pass', 'legacy-pass')).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });
});
