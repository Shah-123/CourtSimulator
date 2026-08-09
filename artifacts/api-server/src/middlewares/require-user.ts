/**
 * Establishes who is asking, and refuses the request if nobody is.
 *
 * Mounted per-router rather than globally: `/healthz` must answer an unattended
 * probe, `/cases` is a shared library, and `/auth/*` is how a request gets a
 * cookie in the first place. Everything that touches a student's own record
 * goes through here.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { readSessionToken, SESSION_COOKIE } from "../lib/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireUser`. Absent on any route that does not use it. */
      userId?: number;
    }
  }
}

export const requireUser: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const userId = readSessionToken(req.cookies?.[SESSION_COOKIE]);
  if (userId === null) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }

  req.userId = userId;
  next();
};

/**
 * The signed-in user's id, for handlers mounted behind `requireUser`.
 *
 * Throws rather than returning undefined. A handler reaching this without the
 * middleware is a wiring mistake, and the failure that matters is the one where
 * `undefined` flows into a query filter and quietly matches nothing — or, on a
 * different query shape, everything.
 */
export function currentUserId(req: Request): number {
  if (req.userId === undefined) {
    throw new Error(
      "currentUserId() called on a route that is not behind requireUser",
    );
  }
  return req.userId;
}
