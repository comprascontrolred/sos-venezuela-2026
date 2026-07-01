import crypto from "crypto";
import axios from "axios";
import { analyzeFactura, analyzeEntrega } from "../services/gemini.js";
import { uploadToDrive } from "../services/driveUpload.js";
import {
  registerFactura,
  registerEntrega,
  getFacturaByNumber,
  upsertInventarioItem,
  deductInventarioItems,
  getInventario,
  getVoluntario,
  getSession,
  setSession,
  clearSession,
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

// buttons: array de hasta 3 { id, title }
async function sendButtons(to, body, buttons) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: buttons.map(({ id, title }) => ({ type: "reply", reply: { id, title } })) },
      },
    },
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
  const data = await analyzeFactura(base64, mimeType);

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

async function handleEntrega(from, buffer, mimeType, numeroFactura) {
  const base64 = buffer.toString("base64");
  const data = await analyzeEntrega(base64, mimeType, `Entrega de la factura número ${numeroFactura}`);

  const hospital = data.hospital;

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

// ── Menú y bienvenida ────────────────────────────────────────────────────────

const MENU_BUTTONS = [
  { id: "menu_factura", title: "📦 Subir factura" },
  { id: "menu_entrega", title: "🚚 Registrar entrega" },
  { id: "menu_inventario", title: "📋 Ver inventario" },
];

async function sendMenu(from, nombre) {
  await sendButtons(from, `¡Hola ${nombre || ""}! ¿Qué querés hacer?`, MENU_BUTTONS);
  await setSession(from, "menu", { nombre });
}

async function enviarInventarioTexto(from) {
  const items = (await getInventario()).filter((i) => Number(i.cantidad) > 0);
  const texto = items.length
    ? items.map((i) => `• ${i.producto}: ${i.cantidad} ${i.unidad || ""}`).join("\n")
    : "No hay insumos en stock por el momento.";
  await sendReply(from, `📋 *Inventario disponible:*\n${texto}`);
}

// ── Dispatcher de conversación ──────────────────────────────────────────────

async function handleIncomingMessage(from, msg) {
  const session = (await getSession(from)) || { estado: "inicio", data: {} };
  const estado = session.estado || "inicio";
  const data = session.data || {};

  const texto = msg.type === "text" ? (msg.text?.body || "").trim() : "";
  const buttonId = msg.type === "interactive" ? msg.interactive?.button_reply?.id : null;
  const esImagen = msg.type === "image";

  switch (estado) {
    case "inicio": {
      await sendButtons(from, "¡Hola! Somos SOS Venezuela 🇻🇪\n¿Sos parte del equipo de voluntarios?", [
        { id: "soy_voluntario", title: "Sí, soy voluntario" },
        { id: "necesito_ayuda", title: "Necesito ayuda" },
      ]);
      await setSession(from, "esperando_membresia");
      return;
    }

    case "esperando_membresia": {
      if (buttonId === "soy_voluntario") {
        await sendReply(from, "Decime tu número de cédula:");
        await setSession(from, "esperando_cedula");
      } else if (buttonId === "necesito_ayuda") {
        await sendReply(from, "Esta opción va a estar disponible muy pronto 🙏. Por ahora escribinos a nuestras redes.");
        await clearSession(from);
      } else {
        await sendButtons(from, "Elegí una opción:", [
          { id: "soy_voluntario", title: "Sí, soy voluntario" },
          { id: "necesito_ayuda", title: "Necesito ayuda" },
        ]);
      }
      return;
    }

    case "esperando_cedula": {
      if (!texto) { await sendReply(from, "Escribime tu número de cédula:"); return; }
      await setSession(from, "esperando_pin", { cedula: texto });
      await sendReply(from, "Ahora tu PIN de 4 dígitos:");
      return;
    }

    case "esperando_pin": {
      if (!texto) { await sendReply(from, "Escribime tu PIN de 4 dígitos:"); return; }
      const voluntario = await getVoluntario(data.cedula, texto);
      if (voluntario) {
        await sendMenu(from, voluntario.nombre);
      } else {
        await sendButtons(from, "❌ Cédula o PIN incorrectos.", [
          { id: "retry_login", title: "Reintentar" },
          { id: "back_menu", title: "Volver al menú" },
        ]);
        await setSession(from, "auth_fallida", data);
      }
      return;
    }

    case "auth_fallida": {
      if (buttonId === "retry_login") {
        await sendReply(from, "Decime tu número de cédula:");
        await setSession(from, "esperando_cedula");
      } else {
        await clearSession(from);
      }
      return;
    }

    case "menu": {
      if (buttonId === "menu_factura") {
        await sendReply(from, "Enviá la foto de la factura 📸");
        await setSession(from, "esperando_foto_factura", data);
      } else if (buttonId === "menu_entrega") {
        await sendReply(from, "¿Número de factura de esta entrega?");
        await setSession(from, "esperando_num_entrega", data);
      } else if (buttonId === "menu_inventario") {
        await enviarInventarioTexto(from);
        await setSession(from, "menu", data);
      } else {
        await sendMenu(from, data.nombre);
      }
      return;
    }

    case "esperando_num_entrega": {
      if (!texto) { await sendReply(from, "Escribime el número de factura:"); return; }
      await setSession(from, "esperando_foto_entrega", { ...data, numero_factura: texto });
      await sendReply(from, "Enviá la foto de la entrega 📸");
      return;
    }

    case "esperando_foto_factura": {
      if (buttonId === "back_menu") { await sendMenu(from, data.nombre); return; }
      if (!esImagen) {
        await sendButtons(from, "Mandame la foto de la factura o volvé al menú:", [{ id: "back_menu", title: "Volver al menú" }]);
        return;
      }
      const { buffer, mimeType } = await downloadImage(msg.image.id);
      await handleFactura(from, buffer, mimeType);
      await sendMenu(from, data.nombre);
      return;
    }

    case "esperando_foto_entrega": {
      if (buttonId === "back_menu") { await sendMenu(from, data.nombre); return; }
      if (!esImagen) {
        await sendButtons(from, "Mandame la foto de la entrega o volvé al menú:", [{ id: "back_menu", title: "Volver al menú" }]);
        return;
      }
      const { buffer, mimeType } = await downloadImage(msg.image.id);
      await handleEntrega(from, buffer, mimeType, data.numero_factura);
      await sendMenu(from, data.nombre);
      return;
    }

    default: {
      await clearSession(from);
      await sendButtons(from, "¡Hola! Somos SOS Venezuela 🇻🇪\n¿Sos parte del equipo de voluntarios?", [
        { id: "soy_voluntario", title: "Sí, soy voluntario" },
        { id: "necesito_ayuda", title: "Necesito ayuda" },
      ]);
      await setSession(from, "esperando_membresia");
    }
  }
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
    if (!msg || !["text", "interactive", "image"].includes(msg.type)) return;

    const from = msg.from;
    if (ALLOWED.size > 0 && !ALLOWED.has(from)) {
      console.warn(`[WA] Número no autorizado: ${from}`);
      return;
    }

    console.log(`[WA] Mensaje de ${from} | tipo: ${msg.type}`);
    await handleIncomingMessage(from, msg);
    console.log(`[WA] Procesado OK`);
  } catch (err) {
    console.error("[WA] Error:", err.message);
  }
}
