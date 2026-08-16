import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  SignUpBody,
  LogInBody,
  SignUpResponse,
  LogInResponse,
  GetCurrentUserResponse,
} from "@workspace/api-zod";
import {
  hashPassword,
  mintSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE,
  verifyPassword,
} from "../lib/auth";
import { AttemptLimiter } from "../lib/rate-limit";
import { currentUserId, requireUser } from "../middlewares/require-user";

const router: IRouter = Router();

/**
 * Guessing costs ~100ms of scrypt, which is friction rather than a wall. These
 * are the wall.
 *
 * Two keys, because either one alone has a failure mode. Limiting by email only
 * lets an attacker spray one guess across a whole roster from one host; limiting
 * by IP only lets them sit on a single account from a botnet — and, worse, a
 * university lab behind one NAT would lock its own students out of an account
 * none of them was attacking.
 *
 * The per-email limit is the one that actually holds here, because it does not
 * depend on Express seeing a real client address. See `trust proxy` in app.ts.
 */
const LOGIN_BY_EMAIL = new AttemptLimiter(8, 15 * 60 * 1000);
const LOGIN_BY_IP = new AttemptLimiter(30, 15 * 60 * 1000);

/** Account creation is not a thing anyone does repeatedly. */
const SIGNUP_BY_IP = new AttemptLimiter(5, 60 * 60 * 1000);

function clientKey(req: { ip?: string | undefined }): string {
  return req.ip ?? "unknown";
}

/**
 * Sends 429 and returns true when the caller is over a limit.
 *
 * Retry-After is the real figure rather than a rounded one: a client that
 * honours it should not come back early and spend another attempt.
 */
function refuseIfLimited(
  res: {
    status: (code: number) => { json: (body: unknown) => unknown };
    set: (field: string, value: string) => unknown;
  },
  ...waits: number[]
): boolean {
  const wait = Math.max(0, ...waits);
  if (wait === 0) return false;

  res.set("Retry-After", String(wait));
  res.status(429).json({
    error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`,
  });
  return true;
}

/**
 * Emails are compared and stored in one canonical form.
 *
 * The unique index is over the stored string, so normalising here rather than
 * in the query is what stops "A@uni.edu.pk" registering alongside "a@uni.edu.pk"
 * and then racing for the same login.
 */
function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A digest no password produces, verified against when the email is unknown.
 *
 * Without it, a failed login on an unregistered email returns immediately while
 * a wrong password on a registered one spends ~100ms in scrypt — which turns
 * the login endpoint into a way to enumerate who has an account. Built once and
 * reused; the point is to spend the work, not to hide the value.
 */
let decoyDigest: Promise<string> | null = null;
function getDecoyDigest(): Promise<string> {
  decoyDigest ??= hashPassword(randomBytes(32).toString("hex"));
  return decoyDigest;
}

router.post("/auth/signup", async (req, res): Promise<void> => {
  if (refuseIfLimited(res, SIGNUP_BY_IP.retryAfter(clientKey(req)))) return;

  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Counted on every accepted attempt, not only on failure: the abuse here is
  // creating accounts successfully, so a limiter that forgave success would
  // never fire on the case it exists for.
  SIGNUP_BY_IP.record(clientKey(req));

  const email = normaliseEmail(parsed.data.email);

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (existing) {
    res.status(409).json({ error: "That email is already registered" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      displayName: parsed.data.displayName.trim(),
      passwordHash: await hashPassword(parsed.data.password),
    })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
    });

  if (!user) {
    res.status(500).json({ error: "Could not create the account" });
    return;
  }

  res.cookie(SESSION_COOKIE, mintSessionToken(user.id), sessionCookieOptions);
  res.status(201).json(SignUpResponse.parse(user));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LogInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = normaliseEmail(parsed.data.email);
  const ip = clientKey(req);

  // Checked before the password is verified, so a blocked caller does not get
  // to spend the server's scrypt time either.
  if (
    refuseIfLimited(
      res,
      LOGIN_BY_EMAIL.retryAfter(email),
      LOGIN_BY_IP.retryAfter(ip),
    )
  ) {
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email));

  const ok = await verifyPassword(
    parsed.data.password,
    user?.passwordHash ?? (await getDecoyDigest()),
  );

  // One message for both failures. Telling a caller that the email was right
  // but the password was wrong hands them half a credential.
  if (!user || !ok) {
    LOGIN_BY_EMAIL.record(email);
    LOGIN_BY_IP.record(ip);
    res.status(401).json({ error: "Email or password is incorrect" });
    return;
  }

  // Only the account's own counter is forgiven. Clearing the IP counter here
  // too would let an attacker who holds one valid account reset their spraying
  // allowance by signing into it between rounds.
  LOGIN_BY_EMAIL.clear(email);

  res.cookie(SESSION_COOKIE, mintSessionToken(user.id), sessionCookieOptions);
  res.json(
    LogInResponse.parse({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    }),
  );
});

router.post("/auth/logout", (_req, res): void => {
  // Cleared with the same attributes it was set with; a cookie cleared under a
  // different path or sameSite is left in place by the browser.
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  res.status(204).end();
});

router.get("/auth/me", requireUser, async (req, res): Promise<void> => {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      displayName: usersTable.displayName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, currentUserId(req)));

  // A valid token for a deleted account: the signature holds but the user is
  // gone. Clearing the cookie stops the client retrying it forever.
  if (!user) {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  res.json(GetCurrentUserResponse.parse(user));
});

export default router;
