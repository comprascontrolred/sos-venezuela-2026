import crypto from "crypto";
import axios from "axios";
import { classifyAndAnalyze } from "../services/gemini.js";
import { uploadToDrive } from "../services/driveUpload.js";
import {
  registerFactura,
  registerEntrega,
  getFacturaByNumber,
  upsertInventarioItem,
  deductInventarioItems,
} from "../services/sheetsAgent.js";

const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID  = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET   = process.env.WHATSAPP_APP_SECRET;

const ALLOWED = new Set(
  (process.env.WHATSAPP_ALLOWED_NUMBERS || "").split(",").map((n) => n.trim()).filter(Boolean)
);

function verifySignature(req) {
  if (!APP_SECRET) {
    console.error("[WA] WHATSAPP_APP_SECRET no configurado — webhook rechazado por seguridad");
    return false;
  }
  const sig      = req.get("x-hub-signature-256") || "";
  const expected = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function sendReply(to, body) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body } },
    { headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" } }
  );
}

async function downloadImage(imageId) {
  const { data: meta } = await axios.get(
    `https://graph.facebook.com/v19.0/${imageId}`,
    { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
  );
  const { data: buffer } = await axios.get(meta.url, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
    responseType: "arraybuffer",
  });
  return { buffer: Buffer.from(buffer), mimeType: meta.mime_type || "image/jpeg" };
}

// ── Handlers ───────────────────────────────────────────────────────────────

async function handleFactura(from, buffer, mimeType) {
  const base64 = buffer.toString("base64");
  const data = await classifyAndAnalyze(base64, mimeType, "");

  const ext = mimeType.split("/")[1] || "jpg";
  const { url: driveUrl, viewUrl: driveViewUrl } = await uploadToDrive(buffer, `factura-${Date.now()}.${ext}`, "factura");

  const factura = await registerFactura({
    proveedor:    data.proveedor,
    fecha:        data.fecha,
    total:        data.total,
    moneda:       data.moneda,
    items:        data.items ?? [],
    driveUrl,
    driveViewUrl,
    whatsappFrom: from,
  });

  // Actualizar inventario con cada ítem
  for (const item of data.items ?? []) {
    await upsertInventarioItem(item);
  }

  const itemsResumen = (data.items ?? [])
    .map((i) => `• ${i.producto} x${i.cantidad}`)
    .join("\n");

  await sendReply(
    from,
    `✅ *Factura ${factura.numero}* registrada\n` +
    `🏪 ${data.proveedor || "Proveedor"}\n` +
    `💰 Total: ${data.total ? `$${data.total} ${data.moneda || ""}` : "no detectado"}\n\n` +
    `📦 *Inventario actualizado:*\n${itemsResumen || "Sin ítems detectados"}`
  );

  return factura;
}

async function handleEntrega(from, buffer, mimeType, caption) {
  const base64 = buffer.toString("base64");
  const data = await classifyAndAnalyze(base64, mimeType, caption);

  const numeroFactura = data.numero_factura;
  const hospital      = data.hospital;

  // Buscar la factura referenciada
  const factura = numeroFactura ? await getFacturaByNumber(numeroFactura) : null;
  const items   = factura?.items ?? [];

  const ext = mimeType.split("/")[1] || "jpg";
  const { url: driveUrl, viewUrl: driveViewUrl } = await uploadToDrive(buffer, `entrega-factura${numeroFactura}-${Date.now()}.${ext}`, "entrega");

  await registerEntrega({
    numero_factura: numeroFactura,
    hospital,
    items,
    driveUrl,
    driveViewUrl,
    whatsappFrom: from,
  });

  // Descontar del inventario
  if (items.length > 0) {
    await deductInventarioItems(items);
  }

  const itemsResumen = items.map((i) => `• ${i.producto} x${i.cantidad}`).join("\n");

  await sendReply(
    from,
    `✅ *Entrega de Factura ${numeroFactura}* registrada\n` +
    `🏥 Hospital: ${hospital || "no especificado"}\n\n` +
    `📦 *Ítems entregados:*\n${itemsResumen || "Ver foto adjunta"}\n\n` +
    `📸 Foto guardada en Drive`
  );
}

// ── Webhook ────────────────────────────────────────────────────────────────

export function verifyWebhook(req, res) {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WA] Webhook verificado");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

export async function handleWebhook(req, res) {
  if (!verifySignature(req)) {
    console.warn("[WA] Firma inválida — request rechazado");
    return res.sendStatus(403);
  }

  res.sendStatus(200); // responder 200 de inmediato para que Meta no reintente

  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg || msg.type !== "image") return;

    const from    = msg.from;
    const caption = msg.image?.caption || "";
    const imageId = msg.image.id;

    if (ALLOWED.size > 0 && !ALLOWED.has(from)) {
      console.warn(`[WA] Número no autorizado: ${from}`);
      return;
    }

    console.log(`[WA] Imagen de ${from} | caption: "${caption}"`);

    const { buffer, mimeType } = await downloadImage(imageId);
    const esEntrega = caption.toLowerCase().includes("entrega") &&
                      (caption.toLowerCase().includes("factura") || caption.toLowerCase().includes("hospital"));

    if (esEntrega) {
      await handleEntrega(from, buffer, mimeType, caption);
    } else {
      await handleFactura(from, buffer, mimeType);
    }

    console.log(`[WA] Procesado OK → ${esEntrega ? "entrega" : "factura"}`);
  } catch (err) {
    console.error("[WA] Error:", err.message);
  }
}
