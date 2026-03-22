import express from "express";
import cors from "cors";
import { router } from "./api/router.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "10mb" }));

// Health check (no auth)
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", version: "0.1.0", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", router);

app.listen(port, () => {
  console.log(`ERA API running on port ${port}`);
});

export default app;
