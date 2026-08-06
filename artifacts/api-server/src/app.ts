import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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
app.use(cors());

// Spoken turns arrive as base64 audio inside JSON, which blows straight past
// body-parser's 100kb default — a few seconds of speech already encodes to
// several hundred kilobytes, and the request fails before the route is even
// reached. The cap is raised for that one path rather than globally, so an
// oversized body is only accepted where audio is expected, and it is set to
// OpenAI's own 25 MB transcription limit: anything larger could not be
// transcribed at the next hop anyway.
app.use("/api/sessions/:id/voice-turns", express.json({ limit: "25mb" }));

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
