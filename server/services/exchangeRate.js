let cache = { usdArs: null, updatedAt: null };
const CACHE_TTL = 60 * 60 * 1000; // 1 hora
const FALLBACK_RATE = 1200; // tasa de respaldo si la API falla

export async function getExchangeRate() {
  if (cache.usdArs && Date.now() - new Date(cache.updatedAt).getTime() < CACHE_TTL) {
    return cache;
  }

  try {
    const res = await fetch("https://api.bluelytics.com.ar/v2/latest");
    const data = await res.json();
    const usdArs = data.oficial.value_sell;
    cache = { usdArs, updatedAt: new Date().toISOString() };
    return cache;
  } catch (err) {
    console.error("Exchange rate fetch failed:", err.message);
    if (cache.usdArs) return cache;
    cache = { usdArs: FALLBACK_RATE, updatedAt: new Date().toISOString() };
    return cache;
  }
}

export function arsToUsd(amountArs, rate) {
  return Math.round((amountArs / rate) * 100) / 100;
}

// Convierte cualquier monto a USD según su moneda. ARS usa la cotización;
// USD (y cualquier otra/desconocida) se asume ya en dólares.
export function toUsd(amount, currency, usdArs) {
  const n = Number(amount || 0);
  if (!n || !isFinite(n)) return 0;
  return String(currency || "USD").toUpperCase() === "ARS" && usdArs ? n / usdArs : n;
}
