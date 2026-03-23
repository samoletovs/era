import { config } from "dotenv";
config(); // Load .env file

// Fail fast on missing required configuration
const REQUIRED_ENV = ["COSMOS_ENDPOINT"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./api/router.js";
import { getCosmosClient } from "./services/cosmos.js";
import { idempotency } from "./middleware/idempotency.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

// Serve frontend static files BEFORE any middleware — same-origin assets must not go through CORS
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../frontend");
  app.use(express.static(frontendPath));
}

// Security headers
app.use(helmet({ contentSecurityPolicy: false })); // CSP off — SPA serves own scripts

// CORS — whitelist known origins
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, mobile)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // Reject unknown origins silently (browser enforces; don't crash with 500)
    cb(null, false);
  },
  credentials: true,
}));

// Rate limiting — 200 requests per minute per IP
app.use(rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" } },
}));

app.use(express.json({ limit: "10mb" }));

// Idempotency — ensures agent retries don't create duplicate operations
app.use(idempotency);

// Request ID + structured logging
app.use((req, _res, next) => {
  const requestId = req.headers["x-request-id"] as string || crypto.randomUUID();
  (req as any).requestId = requestId;
  _res.setHeader("x-request-id", requestId);

  const start = Date.now();
  _res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path !== "/health") {
      const log = {
        method: req.method,
        path: req.path,
        status: _res.statusCode,
        duration,
        requestId,
        userId: (req as any).user?.id,
      };
      console.warn(JSON.stringify(log));
    }
  });
  next();
});

// Health check (no auth) — includes dependency checks
app.get("/health", async (_req, res) => {
  const checks: Record<string, string> = { api: "healthy" };
  try {
    const client = getCosmosClient();
    await client.getDatabaseAccount();
    checks.database = "healthy";
  } catch {
    checks.database = "unhealthy";
  }
  const overall = Object.values(checks).every(s => s === "healthy") ? "healthy" : "degraded";
  res.status(overall === "healthy" ? 200 : 503).json({
    status: overall,
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    checks,
  });
});

// API routes
app.use("/api", router);

// SPA catch-all — serve index.html for client-side routes
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../frontend");
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

const server = app.listen(port, () => {
  console.warn(`ERA API running on port ${port}`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.warn(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    console.warn("HTTP server closed");
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10_000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
