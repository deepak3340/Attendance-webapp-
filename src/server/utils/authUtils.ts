import crypto from 'crypto';
import * as config from '../config.js';

export interface TokenPayload {
  uid: string;
  role: 'principal' | 'teacher';
  name: string;
  email?: string;
  teacherCode?: string;
  principalCode?: string;
  iat: number;
  exp: number;
}

export interface ResetTokenPayload {
  uid: string;
  mobileNumber: string;
  type: 'password_reset';
  iat: number;
  exp: number;
}

// In-memory OTP cache: mobile -> { hash, expiresAt, attempts }
interface OtpEntry {
  hash: string;
  salt: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpEntry>();

// Used reset tokens set to prevent replay
const usedResetTokens = new Set<string>();

/**
 * Hash password with unique random salt using scrypt
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password.trim(), salt, 64);
  return {
    hash: derivedKey.toString('hex'),
    salt
  };
}

/**
 * Verify password against stored salt and hash using timing-safe comparison
 */
export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  try {
    const derivedKey = crypto.scryptSync(password.trim(), storedSalt, 64);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derivedKey.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derivedKey, storedBuf);
  } catch {
    return false;
  }
}

/**
 * Create a cryptographically signed HMAC-SHA256 session token
 */
export function generateSessionToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresInHours = 24): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInHours * 3600
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', config.SECRET_KEY).update(data).digest('base64url');

  return `${data}.${signature}`;
}

/**
 * Verify and decode an HMAC-SHA256 session token
 */
export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto.createHmac('sha256', config.SECRET_KEY).update(data).digest('base64url');

    if (signature.length !== expectedSignature.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload: TokenPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Store and generate a secure 6-digit OTP for a given mobile number
 */
export function createOtpForMobile(mobile: string, validityMinutes = 10): { code: string; expiresAt: number } {
  // Generate cryptographically secure 6-digit code
  const code = String(crypto.randomInt(100000, 999999));
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(code).digest('hex');
  const expiresAt = Date.now() + validityMinutes * 60 * 1000;

  otpStore.set(mobile, { hash, salt, expiresAt, attempts: 0 });
  return { code, expiresAt };
}

/**
 * Verify submitted OTP against store
 */
export function verifyOtpForMobile(mobile: string, code: string): boolean {
  const entry = otpStore.get(mobile);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(mobile);
    return false;
  }

  entry.attempts += 1;
  if (entry.attempts > 5) {
    otpStore.delete(mobile);
    return false; // Exceeded max attempts
  }

  const checkHash = crypto.createHmac('sha256', entry.salt).update(code.trim()).digest('hex');
  const valid = crypto.timingSafeEqual(Buffer.from(entry.hash), Buffer.from(checkHash));
  if (valid) {
    otpStore.delete(mobile); // One-time use
    return true;
  }
  return false;
}

/**
 * Generate a single-use password reset token (valid for 15 minutes)
 */
export function generatePasswordResetToken(uid: string, mobileNumber: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: ResetTokenPayload = {
    uid,
    mobileNumber,
    type: 'password_reset',
    iat: now,
    exp: now + 15 * 60 // 15 mins
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', config.SECRET_KEY).update(data).digest('base64url');

  return `${data}.${signature}`;
}

/**
 * Verify and consume a single-use password reset token
 */
export function verifyAndConsumeResetToken(token: string): ResetTokenPayload | null {
  if (usedResetTokens.has(token)) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto.createHmac('sha256', config.SECRET_KEY).update(data).digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const payload: ResetTokenPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    if (payload.type !== 'password_reset') return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    // Mark as consumed
    usedResetTokens.add(token);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Normalize phone number to clean standard 10 digits
 */
export function normalizeMobileNumber(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}
