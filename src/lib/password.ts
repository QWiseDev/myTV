import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scryptCallback);

const SCRYPT_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/**
 * 判断存储字符串是否为 scrypt 哈希格式（scrypt$<saltHex>$<hashHex>）
 */
export function isPasswordHash(stored: string): boolean {
  if (!stored || !stored.startsWith(`${SCRYPT_PREFIX}$`)) {
    return false;
  }
  const parts = stored.split('$');
  return (
    parts.length === 3 &&
    parts[0] === SCRYPT_PREFIX &&
    /^[0-9a-f]+$/i.test(parts[1]) &&
    /^[0-9a-f]+$/i.test(parts[2])
  );
}

/**
 * 使用随机盐值 + Node scrypt 对明文密码进行单向哈希
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${SCRYPT_PREFIX}$${salt}$${derived.toString('hex')}`;
}

/**
 * 校验用户输入密码与存储凭证是否匹配；
 * 兼容历史明文密码并在匹配成功时标记 needsRehash 以便无感升级为 scrypt 哈希。
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!stored || typeof password !== 'string') {
    return { valid: false, needsRehash: false };
  }

  if (isPasswordHash(stored)) {
    const [, salt, expectedHex] = stored.split('$');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (expectedBuf.length === 0) {
      return { valid: false, needsRehash: false };
    }

    const derived = (await scryptAsync(
      password,
      salt,
      expectedBuf.length,
    )) as Buffer;
    if (derived.length !== expectedBuf.length) {
      return { valid: false, needsRehash: false };
    }

    return {
      valid: timingSafeEqual(derived, expectedBuf),
      needsRehash: false,
    };
  }

  // 兼容旧明文密码：采用等长缓冲区分支，避免因明文长度泄露时序信息
  const inputBuf = Buffer.from(password, 'utf8');
  const storedBuf = Buffer.from(stored, 'utf8');
  if (inputBuf.length !== storedBuf.length) {
    timingSafeEqual(inputBuf, inputBuf);
    return { valid: false, needsRehash: false };
  }

  const valid = timingSafeEqual(inputBuf, storedBuf);
  return { valid, needsRehash: valid };
}
