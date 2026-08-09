/**
 * Password hashing and session tokens.
 *
 * Both are built on `node:crypto` rather than a library. scrypt and HMAC are in
 * the standard library, the parameters below are the decisions a library would
 * otherwise make silently, and a dependency that handles credentials is one more
 * thing to keep patched before a demo.
 *
 * This is authentication only. It says who is asking; the scoping that decides
 * what they may read lives in the route queries, not here.
 */
import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

/**
 * scrypt cost parameters. N=16384 is the interactive-login figure from the
 * scrypt paper — roughly 100ms and 16 MB per hash on a laptop, which is slow
 * enough to make offline guessing expensive and fast enough that a student
 * logging in does not notice it.
 *
 * They are written into every digest, so raising them later re-hashes new
 * passwords without locking out accounts stored under the old cost.
 */
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

/** 128 * N * r = 16 MB for the parameters above; the headroom covers a raise. */
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export const SESSION_COOKIE = "adalat_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N, r, p, maxmem: SCRYPT_MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** Returns a self-describing digest: `scrypt$N$r$p$salt$key`, salt and key base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Constant-time verification against a stored digest.
 *
 * Returns false rather than throwing on a malformed digest: a corrupted row
 * should fail one login, not crash the route for everyone.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  try {
    const expected = Buffer.from(rawKey!, "base64");
    const actual = await scryptAsync(
      password,
      Buffer.from(rawSalt!, "base64"),
      N,
      r,
      p,
    );
    // timingSafeEqual throws on a length mismatch rather than returning false,
    // so the lengths are compared first — a truncated digest would otherwise be
    // a 500 instead of a failed login.
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/**
 * The signing secret.
 *
 * Read lazily and thrown on rather than defaulted. A generated fallback would
 * make every restart silently invalidate all sessions, and a hardcoded one
 * would make every deployment forgeable — both fail quietly, which is the worst
 * behaviour available for this particular value.
 */
function getSecret(): string {
  const secret = process.env["AUTH_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to at least 32 characters before authentication " +
        "can be used. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * Mints a stateless session token: `userId.expiry.signature`.
 *
 * Stateless because a classroom does not need per-device revocation, and a
 * token table would be a second thing to keep in step with the users table.
 * The cost is that the only way to revoke every session is to rotate
 * AUTH_SECRET — which is the right lever if credentials ever leak, and worth
 * knowing is the only one.
 */
export function mintSessionToken(userId: number): string {
  const payload = `${userId}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/** The user id a token attests to, or null if it is forged, malformed or expired. */
export function readSessionToken(token: string | undefined): number | null {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1), "base64url");
  const expected = Buffer.from(sign(payload), "base64url");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  // Only parsed after the signature holds, so a forged payload never reaches
  // Number().
  const [rawId, rawExpiry] = payload.split(".");
  const userId = Number(rawId);
  const expiry = Number(rawExpiry);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;

  return userId;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  // Set over TLS only in production. Left off in development because the dev
  // server is plain http and a Secure cookie would simply never be sent back,
  // which presents as "login succeeds then immediately logs out".
  secure: process.env["NODE_ENV"] === "production",
  maxAge: SESSION_TTL_MS,
  path: "/",
} as const;
