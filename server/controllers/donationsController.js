import { preferenceClient, paymentClient } from "../config/mercadopago.js";
import { createOrder, captureOrder } from "../config/paypal.js";
import { registerDonation, getDonations } from "../services/sheetsAgent.js";
import { getExchangeRate, arsToUsd } from "../services/exchangeRate.js";
import { broadcast } from "../services/sseManager.js";

async function insertAndBroadcast(donation) {
  const data = await registerDonation(donation);

  if (data.status === "approved") {
    broadcast({
      id: data.id,
      name: data.donor_name,
      amount: data.amount_usd,
      currency: data.currency,
    });
  }

  return data;
}

// ── Listado público (para la tabla del frontend) ──

export async function listDonations(req, res) {
  try {
    const all = await getDonations();
    const approved = all
      .filter((d) => d.status === "approved")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 50)
      .map((d) => ({
        donor_name: d.donor_name || "Anónimo",
        amount_usd: Number(d.amount_usd) || 0,
        currency: d.currency,
        method: d.method,
        created_at: d.created_at,
      }));
    res.json(approved);
  } catch (err) {
    console.error("List donations error:", err);
    res.status(500).json({ error: "Error fetching donations" });
  }
}

// ── Mercado Pago ──

export async function mpCreate(req, res) {
  try {
    const { amount, donor_name, email } = req.body;

    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            title: "Donación SOS Venezuela",
            quantity: 1,
            unit_price: Number(amount),
            currency_id: "ARS",
          },
        ],
        payer: { email: email || "donante@sosvenezuela.org" },
        back_urls: {
          success: `${process.env.FRONTEND_URL}?status=approved`,
          failure: `${process.env.FRONTEND_URL}?status=failed`,
          pending: `${process.env.FRONTEND_URL}?status=pending`,
        },
        auto_return: "approved",
        notification_url: `${process.env.FRONTEND_URL}/api/donations/mp/webhook`,
        external_reference: JSON.stringify({ donor_name, amount }),
      },
    });

    res.json({ init_point: preference.init_point, id: preference.id });
  } catch (err) {
    console.error("MP create error:", err);
    res.status(500).json({ error: "Error creating MP preference" });
  }
}

export async function mpWebhook(req, res) {
  try {
    const { type, data } = req.body;

    if (type !== "payment") return res.sendStatus(200);

    const payment = await paymentClient.get({ id: data.id });

    if (payment.status !== "approved") return res.sendStatus(200);

    const rate = await getExchangeRate();
    const amountArs = payment.transaction_amount;
    // Comisión + retenciones reales: bruto − neto recibido (dato que informa MP).
    const netArs = payment.transaction_details?.net_received_amount ?? amountArs;
    const feeArs = Math.max(0, amountArs - netArs);
    const amountUsd = arsToUsd(amountArs, rate.usdArs);
    const feeUsd = arsToUsd(feeArs, rate.usdArs);

    let donorName = "Anónimo";
    try {
      const ref = JSON.parse(payment.external_reference);
      donorName = ref.donor_name || donorName;
    } catch {}

    await insertAndBroadcast({
      donor_name: donorName,
      amount_usd: amountUsd,
      amount_original: amountArs,
      currency: "ARS",
      method: "mercadopago",
      country: "AR",
      status: "approved",
      fee_usd: feeUsd,
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("MP webhook error:", err);
    res.sendStatus(500);
  }
}

// ── PayPal ──

export async function paypalCreate(req, res) {
  try {
    const { amount } = req.body;
    const order = await createOrder(Number(amount));
    res.json({ id: order.id, links: order.links });
  } catch (err) {
    console.error("PayPal create error:", err);
    res.status(500).json({ error: "Error creating PayPal order" });
  }
}

export async function paypalCapture(req, res) {
  try {
    const { order_id, donor_name } = req.body;
    const capture = await captureOrder(order_id);

    if (capture.status !== "COMPLETED") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const captureData = capture.purchase_units[0].payments.captures[0];
    const breakdown = captureData.seller_receivable_breakdown || {};
    // PayPal informa el bruto y su comisión en seller_receivable_breakdown.
    const amountUsd = Number(breakdown.gross_amount?.value ?? captureData.amount.value);
    const feeUsd = Number(breakdown.paypal_fee?.value ?? 0);

    const data = await insertAndBroadcast({
      donor_name: donor_name || "Anónimo",
      amount_usd: amountUsd,
      amount_original: amountUsd,
      currency: "USD",
      method: "paypal",
      country: "INT",
      status: "approved",
      fee_usd: feeUsd,
    });

    res.json({ donation: data });
  } catch (err) {
    console.error("PayPal capture error:", err);
    res.status(500).json({ error: "Error capturing PayPal payment" });
  }
}
