import { supabase } from "../config/supabase.js";

export async function getSummary(req, res) {
  try {
    const [donationsRes, expensesRes] = await Promise.all([
      supabase
        .from("donations")
        .select("amount_usd, created_at")
        .eq("status", "approved"),
      supabase.from("expenses").select("amount_usd"),
    ]);

    const totalRaised = (donationsRes.data || []).reduce(
      (sum, d) => sum + Number(d.amount_usd),
      0
    );
    const totalExpenses = (expensesRes.data || []).reduce(
      (sum, e) => sum + Number(e.amount_usd),
      0
    );
    const donationsCount = donationsRes.data?.length || 0;
    const lastDonation =
      donationsRes.data?.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )[0] || null;

    // Impuestos estimados (IVA 21% sobre gastos documentados)
    const taxes = Math.round(totalExpenses * 0.21 * 100) / 100;

    res.json({
      totalRaised: Math.round(totalRaised * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      taxes,
      balance: Math.round((totalRaised - totalExpenses) * 100) / 100,
      donationsCount,
      lastDonation,
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: "Error fetching summary" });
  }
}
