import express from "express";
import { router } from "./api/router";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api", router);

app.listen(port, () => {
  console.log(`ERA API running on port ${port}`);
});

export default app;
