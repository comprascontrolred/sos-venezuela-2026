import "dotenv/config";
import express from "express";
import cors from "cors";

import donationsRouter from "./routes/donations.js";
import transparencyRouter from "./routes/transparency.js";
import uploadRouter from "./routes/upload.js";
import { getSummary } from "./controllers/summaryController.js";
import { getRate } from "./controllers/exchangeRateController.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

// ── Routes ──
app.get("/api/summary", getSummary);
app.get("/api/exchange-rate", getRate);
app.use("/api/donations", donationsRouter);
app.use("/api/transparency", transparencyRouter);
app.use("/api/upload", uploadRouter);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`SOS Venezuela API running on port ${PORT}`);
});
