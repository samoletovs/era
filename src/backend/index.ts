import { config } from "dotenv";
config(); // Load .env file

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./api/router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: (origin, cb) => cb(null, true) }));
app.use(express.json({ limit: "10mb" }));

// Health check (no auth)
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", version: "0.1.0", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", router);

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../frontend");
  app.use(express.static(frontendPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

app.listen(port, () => {
  console.warn(`ERA API running on port ${port}`);
});

export default app;
