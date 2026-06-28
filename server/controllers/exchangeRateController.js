import { getExchangeRate } from "../services/exchangeRate.js";

export async function getRate(req, res) {
  try {
    const rate = await getExchangeRate();
    res.json({ usdArs: rate.usdArs, updatedAt: rate.updatedAt });
  } catch (err) {
    console.error("Exchange rate error:", err);
    res.status(500).json({ error: "Exchange rate unavailable" });
  }
}
