import { supabase } from "../config/supabase.js";
import { preferenceClient, paymentClient } from "../config/mercadopago.js";
import { createOrder, captureOrder } from "../config/paypal.js";
import { appendDonation } from "../config/sheets.js";
import { getExchangeRate, arsToUsd } from "../services/exchangeRate.js";
import { broadcast } from "../services/sseManager.js";

async function insertAndBroadcast(donation) {
  const { data, error } = await supabase
    .from("donations")
    .insert(donation)
    .select()
    .single();

  if (error) throw error;

  if (data.status === "approved") {
    broadcast({
      id: data.id,
      name: data.donor_name,
      amount: data.amount_usd,
      currency: "USD",
    });

    appendDonation(data).catch((err) =>
      console.error("Sheets sync failed:", err.message)
    );
  }

  return data;
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
    const amountUsd = arsToUsd(amountArs, rate.usdArs);

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
    const { amount, donor_name } = req.body;
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

    const amountUsd = Number(
      capture.purchase_units[0].payments.captures[0].amount.value
    );

    const data = await insertAndBroadcast({
      donor_name: donor_name || "Anónimo",
      amount_usd: amountUsd,
      amount_original: amountUsd,
      currency: "USD",
      method: "paypal",
      country: "INT",
      status: "approved",
    });

    res.json({ donation: data });
  } catch (err) {
    console.error("PayPal capture error:", err);
    res.status(500).json({ error: "Error capturing PayPal payment" });
  }
}

// ── Transferencia manual ──

export async function transferCreate(req, res) {
  try {
    const { donor_name, amount, currency, receipt_url, country } = req.body;

    let amountUsd = Number(amount);
    const amountOriginal = amountUsd;

    if (currency === "ARS") {
      const rate = await getExchangeRate();
      amountUsd = arsToUsd(amountUsd, rate.usdArs);
    }
    // USDT entra directo como USD

    const data = await insertAndBroadcast({
      donor_name: donor_name || "Anónimo",
      amount_usd: amountUsd,
      amount_original: amountOriginal,
      currency: currency || "ARS",
      method: "transfer",
      country: country || "AR",
      status: "pending",
      receipt_url,
    });

    res.json({ donation: data });
  } catch (err) {
    console.error("Transfer error:", err);
    res.status(500).json({ error: "Error registering transfer" });
  }
}
