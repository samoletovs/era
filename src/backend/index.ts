// Load .env file as a side effect of import — must run BEFORE observability.ts
// is evaluated so APPLICATIONINSIGHTS_CONNECTION_STRING is populated.
import 'dotenv/config';

// Bootstrap OpenTelemetry / Azure Monitor BEFORE any other imports that touch
// HTTP, Cosmos, or OpenAI — auto-instrumentation works only on libraries
// loaded after `useAzureMonitor()` runs. The module uses top-level await so
// the rest of this file's imports won't begin evaluating until the tracer
// provider is registered. Silent no-op in dev and tests (no connection string).
import './observability.js';

// Fail fast on missing required configuration
const REQUIRED_ENV = ['COSMOS_ENDPOINT'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { router } from './api/router.js';
import { getHealthReport } from './services/health.js';
import { idempotency } from './middleware/idempotency.js';
import { errorHandlerMiddleware } from './middleware/error-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;
let getIndexHtml: (() => string) | null = null;

// Security headers — crossOriginOpenerPolicy: false allows Google OAuth popup to communicate back
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: [
          "'self'",
          'https://accounts.google.com',
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
        ],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https://accounts.google.com'],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        workerSrc: [
          "'self'",
          'blob:',
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
        ],
      },
    },
    crossOriginOpenerPolicy: false,
  }),
);

// Serve frontend static files before CORS — same-origin assets must not go through CORS checks
import fs from 'fs';

if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../frontend');
  const indexPath = path.join(frontendPath, 'index.html');

  // Cache index.html
  let indexHtml: string | null = null;
  getIndexHtml = () => {
    if (!indexHtml) {
      indexHtml = fs.readFileSync(indexPath, 'utf-8');
    }
    return indexHtml;
  };

  app.get('/runtime-config.js', (_req, res) => {
    res.type('application/javascript');
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    res.send(`window.__ERA_GOOGLE_CLIENT_ID__ = ${JSON.stringify(clientId)};`);
  });

  // Serve index.html with injected config for root and SPA routes
  app.get('/', (_req, res) => {
    res.type('html').send(getIndexHtml?.() ?? '');
  });

  // Static assets (JS, CSS, images) — excludes index.html since GET / is handled above
  app.use(express.static(frontendPath, { index: false }));
}

// CORS — whitelist known origins
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, mobile)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      // Reject unknown origins silently (browser enforces; don't crash with 500)
      cb(null, false);
    },
    credentials: true,
  }),
);

// Rate limiting — 200 requests per minute per IP
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later',
      },
    },
  }),
);

// Tighter limits for mutation-heavy financial routes.
const financialWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET',
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many write operations, please retry shortly',
    },
  },
});
app.use('/api/companies/:companyId/journal-entries', financialWriteLimiter);
app.use('/api/companies/:companyId/invoices', financialWriteLimiter);
app.use('/api/companies/:companyId/payments', financialWriteLimiter);

app.use(express.json({ limit: '10mb' }));

// Idempotency — ensures agent retries don't create duplicate operations
app.use(idempotency);

// Request ID + structured logging
app.use((req, _res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  (req as any).requestId = requestId;
  _res.setHeader('x-request-id', requestId);

  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health' && req.path !== '/ping') {
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

// Liveness probe — always 200 if the process is alive (used by Container Apps probes)
app.get('/ping', (_req, res) => {
  res.json({ ok: true });
});

// Health check (no auth) — includes dependency checks
app.get('/health', async (_req, res) => {
  const report = await getHealthReport();
  res.status(report.status === 'healthy' ? 200 : 503).json(report);
});

// API routes
app.use('/api', router);

if (process.env.NODE_ENV === 'production') {
  app.get('/{*splat}', (_req, res) => {
    res.type('html').send(getIndexHtml?.() ?? '');
  });
}

// Top-level error handler — backstop for anything that escapes per-route
// try/catch. Without it Express's default handler renders an HTML stack
// trace, which contradicts the "no naked stack traces in UI" guarantee.
// Must come AFTER routes / static / SPA catch-all so it only fires on errors.
app.use(errorHandlerMiddleware);

// Skip listen + signal handlers under tests so Vitest can import the app
// without starting an HTTP server or registering global signal handlers.
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, (error?: Error) => {
    if (error) {
      console.error(`Failed to start server: ${error.message}`);
      process.exit(1);
    }
    console.warn(`ERA API running on port ${port}`);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.warn(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      console.warn('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10s if connections don't close
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
