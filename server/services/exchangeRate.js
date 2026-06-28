import { supabase } from "../config/supabase.js";

let cache = { usdArs: null, updatedAt: null };
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getExchangeRate() {
  if (cache.usdArs && Date.now() - new Date(cache.updatedAt).getTime() < CACHE_TTL) {
    return cache;
  }

  try {
    const res = await fetch("https://api.bluelytics.com.ar/v2/latest");
    const data = await res.json();
    const usdArs = data.oficial.value_sell;

    const { data: inserted } = await supabase
      .from("exchange_rates")
      .insert({ usd_ars: usdArs, source: "BNA (bluelytics)" })
      .select()
      .single();

    cache = { usdArs, updatedAt: inserted.fetched_at };
    return cache;
  } catch (err) {
    console.error("Exchange rate fetch failed:", err.message);

    const { data: last } = await supabase
      .from("exchange_rates")
      .select("usd_ars, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    if (last) {
      cache = { usdArs: last.usd_ars, updatedAt: last.fetched_at };
      return cache;
    }

    throw new Error("No exchange rate available");
  }
}

export function arsToUsd(amountArs, rate) {
  return Math.round((amountArs / rate) * 100) / 100;
}
