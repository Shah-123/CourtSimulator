import express, { type ErrorRequestHandler, type Express } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// `req.ip` is the address of whoever opened the socket. Behind a reverse proxy —
// including the Vite dev proxy — that is the proxy, so every request looks like
// one client and the per-IP login limits collapse into a single shared bucket.
//
// Opt-in rather than on by default, because the failure runs the other way too:
// trusting X-Forwarded-For when nothing upstream sets it lets any caller forge
// an address per request and walk straight past those limits. Set TRUST_PROXY to
// the number of proxies in front of this server (usually 1), or a subnet.
const trustProxy = process.env["TRUST_PROXY"];
if (trustProxy) {
  app.set(
    "trust proxy",
    /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
  );
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// The session cookie is same-origin: the browser reaches the API through the
// Vite proxy at /api, so credentials ride along without CORS being involved.
// Leaving cors() at its default (no credentials, no allowlist) keeps it that
// way — a cross-origin caller cannot send the cookie, which is the property
// that makes the httpOnly cookie worth using in the first place.
app.use(cors());
app.use(cookieParser());

// Spoken turns arrive as base64 audio inside JSON, which blows straight past
// body-parser's 100kb default — a few seconds of speech already encodes to
// several hundred kilobytes, and the request fails before the route is even
// reached. The cap is raised for that one path rather than globally, so an
// oversized body is only accepted where audio is expected, and it is set to
// OpenAI's own 25 MB transcription limit: anything larger could not be
// transcribed at the next hop anyway.
app.use(
  ["/api/sessions/:id/voice-turns", "/api/sessions/:id/interject"],
  express.json({ limit: "25mb" }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

const handleError: ErrorRequestHandler = (err, req, res, _next) => {
  req.log.error({ err }, "Unhandled request error");
  if (res.headersSent) return;

  // Middleware rejections carry their own status — body-parser's 413 on an
  // oversized recording being the one a student can actually trigger. Reporting
  // those as 500 sends the user hunting for a server fault that is not there.
  const status =
    typeof (err as { status?: unknown }).status === "number" &&
    (err as { status: number }).status >= 400 &&
    (err as { status: number }).status < 500
      ? (err as { status: number }).status
      : 500;

  res.status(status).json({
    error: status === 413 ? "Recording too large" : "Internal server error",
  });
};

app.use(handleError);

export default app;
