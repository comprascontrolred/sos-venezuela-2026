import { getDonations, getGastos } from "../services/sheetsAgent.js";
import { getExchangeRate, toUsd } from "../services/exchangeRate.js";

const round2 = (n) => Math.round(n * 100) / 100;

export async function getSummary(req, res) {
  try {
    const [donations, gastos, rate] = await Promise.all([
      getDonations(),
      getGastos(),
      getExchangeRate(),
    ]);

    const approved = donations.filter((d) => d.status === "approved");

    // Recaudado bruto: las donaciones ya se guardan normalizadas a USD.
    const totalRaised = approved.reduce((sum, d) => sum + Number(d.amount_usd || 0), 0);

    // Comisiones/impuestos: lo que MercadoPago/PayPal descontaron (dato real por donación).
    const taxes = approved.reduce((sum, d) => sum + Number(d.fee_usd || 0), 0);

    // Gastos: cada factura se convierte a USD según su moneda antes de sumar.
    const totalExpenses = gastos.reduce(
      (sum, g) => sum + toUsd(g.total, g.moneda, rate.usdArs),
      0
    );

    const donationsCount = approved.length;
    const lastDonation =
      approved
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;

    res.json({
      totalRaised: round2(totalRaised),
      totalExpenses: round2(totalExpenses),
      taxes: round2(taxes),
      // Balance disponible = recaudado − comisiones − gastos
      balance: round2(totalRaised - taxes - totalExpenses),
      donationsCount,
      lastDonation,
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: "Error fetching summary" });
  }
}
