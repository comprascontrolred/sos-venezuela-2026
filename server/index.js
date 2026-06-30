import "dotenv/config";
import express from "express";
import cors from "cors";

import donationsRouter    from "./routes/donations.js";
import transparencyRouter from "./routes/transparency.js";
import whatsappRouter     from "./routes/whatsapp.js";
import { getSummary }     from "./controllers/summaryController.js";
import { getRate }        from "./controllers/exchangeRateController.js";
import { startTronMonitor } from "./services/tronMonitor.js";

const app  = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:8765",
  "http://127.0.0.1:8765",
  "http://localhost:3000",
  "http://localhost:5173",
  "https://sos-venezuela.vercel.app",
].filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Permite peticiones sin Origin (curl, server-to-server) y los orígenes en la lista.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  })
);

// rawBody needed for WhatsApp signature verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.get("/api/summary",       getSummary);
app.get("/api/exchange-rate", getRate);
app.use("/api/donations",     donationsRouter);
app.use("/api/transparency",  transparencyRouter);
app.use("/api/whatsapp",      whatsappRouter);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`SOS Venezuela API running on port ${PORT}`);
  startTronMonitor();
});
