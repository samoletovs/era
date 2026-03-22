import { Router } from "express";

export const router = Router();

// Module route placeholders
router.get("/", (_req, res) => {
  res.json({
    name: "ERA API",
    version: "0.1.0",
    modules: [
      "finance",
      "inventory",
      "sales",
      "procurement",
      "hr",
      "reporting",
    ],
  });
});
