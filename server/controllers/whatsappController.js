import crypto from "crypto";
import axios from "axios";
import { analyzeFactura, analyzeEntrega, analizarNecesidad } from "../services/gemini.js";
import { uploadToDrive } from "../services/driveUpload.js";
import {
  registerFactura,
  registerEntrega,
  getFacturaByNumber,
  upsertInventarioItem,
  deductInventarioItems,
  getInventario,
  getNecesidades,
  getVoluntario,
  registerPedido,
  revisarPedidosPendientes,
  getSession,
  setSession,
  clearSession,
} from "../services/sheetsAgent.js";

const WA_TOKEN     = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID  = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET   = process.env.WHATSAPP_APP_SECRET;
const ADMIN_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER;

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

async function notifyAdmin(text) {
  if (!ADMIN_NUMBER) return;
  try {
    await sendReply(ADMIN_NUMBER, text);
  } catch (err) {
    console.error("[WA] Error notificando al admin:", err.message);
  }
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

// rows: array de hasta 10 { id, title, description? }
async function sendList(to, body, buttonText, rows) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: { button: buttonText, sections: [{ rows }] },
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

  // Re-chequear pedidos pendientes: puede que este stock nuevo termine de cubrir alguno
  const pedidosCubiertos = await revisarPedidosPendientes();
  for (const p of pedidosCubiertos) {
    await notifyAdmin(
      `✅ *Pedido cubierto* — ya hay stock para entregarle a:\n` +
      `👤 ${p.nombre} — 📞 ${p.telefono}\n` +
      `📍 ${p.direccion}\n` +
      `Contactate para coordinar la entrega.`
    );
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

const MENU_ROWS = [
  { id: "menu_factura", title: "📦 Subir factura" },
  { id: "menu_entrega", title: "🚚 Registrar entrega" },
  { id: "menu_inventario", title: "📋 Ver inventario" },
  { id: "menu_necesidades", title: "🆘 Ver necesidades" },
  { id: "menu_salir", title: "🚪 Salir" },
];

const MENSAJE_BIENVENIDA =
  "¡Hola! 👋🇦🇷🇻🇪 Somos *SOS Venezuela*, una iniciativa de *Control Red* 🔴, *Redvision* 📡 y *Caracas Market* 🛒 — " +
  "empresas argentinas que decidimos ayudar a nuestros hermanos venezolanos 💛. Contamos con equipo propio " +
  "operando directamente en Caracas 🇻🇪, así que podemos asegurarnos de que la ayuda realmente llegue, y " +
  "estamos para acompañarte en lo que necesites 🙏.\n\n¿Sos parte del equipo de voluntarios? 🤝";

const BOTONES_MEMBRESIA = [
  { id: "soy_voluntario", title: "✅ Soy voluntario" },
  { id: "necesito_ayuda", title: "🆘 Necesito ayuda" },
];

async function sendBienvenida(from) {
  await sendButtons(from, MENSAJE_BIENVENIDA, BOTONES_MEMBRESIA);
  await setSession(from, "esperando_membresia");
}

// Estados de voluntario (post-login o intentando loguearse) vs. rama de gente que pide ayuda —
// cada grupo corta la sesión con un mensaje de despedida distinto.
const ESTADOS_SALIR_VOLUNTARIO = [
  "esperando_cedula", "esperando_pin", "auth_fallida",
  "menu", "esperando_num_entrega", "esperando_foto_factura", "esperando_foto_entrega",
];
const ESTADOS_SALIR_AYUDA = [
  "esperando_membresia", "post_inventario_ayuda",
  "pedido_nombre", "pedido_telefono", "pedido_direccion", "pedido_tipo_lugar", "pedido_productos", "pedido_confirmar_mas",
];
const MENSAJE_SALIDA_VOLUNTARIO =
  "🙏💛 ¡Muchas gracias por ayudarnos a lograr esta gran tarea! Argentina 🇦🇷 y Venezuela 🇻🇪 son países hermanos. ¡Nos vemos pronto! ✨";
const MENSAJE_SALIDA_AYUDA =
  "Gracias por escribirnos 🙏💛. No estás solo/a en esto — si necesitás algo más, escribí *hola* 👋 cuando quieras y seguimos donde quedamos.";

async function sendMenu(from, nombre) {
  await sendList(from, `¡Hola ${nombre || ""}! 👋 ¿Qué querés hacer? 🙌`, "Elegir opción", MENU_ROWS);
  await setSession(from, "menu", { nombre });
}

async function enviarInventarioTexto(from) {
  const items = (await getInventario()).filter((i) => Number(i.cantidad) > 0);
  const texto = items.length
    ? items.map((i) => `• ${i.producto}: ${i.cantidad} ${i.unidad || ""}`).join("\n")
    : "😔 No hay insumos en stock por el momento.";
  await sendReply(from, `📋 *Inventario disponible:* ✨\n${texto}`);
}

function esRealizada(n) {
  return n.estado.trim().toUpperCase() === "REALIZADA";
}

async function enviarNecesidadesTexto(from) {
  const necesidades = await getNecesidades();
  if (!necesidades.length) {
    await sendReply(from, "🆘 *Necesidades actuales:*\nNo hay necesidades cargadas por el momento.");
    return;
  }

  // Pendientes primero, realizadas al final (se conservan como registro, no se borran)
  const ordenadas = [...necesidades].sort((a, b) => Number(esRealizada(a)) - Number(esRealizada(b)));

  const texto = ordenadas.map((n) => {
    const linea = `${n.descripcion}${n.organizacion ? ` (${n.organizacion})` : ""}${n.prioridad ? ` — prioridad: ${n.prioridad}` : ""}`;
    return esRealizada(n) ? `✅ ~${linea}~ (realizada)` : `• ${linea}`;
  }).join("\n");

  await sendReply(from, `🆘 *Necesidades actuales:*\n${texto}`);
}

const TIPO_LUGAR_BOTONES = [
  { id: "lugar_particular", title: "🏠 Particular" },
  { id: "lugar_hospital", title: "🏥 Hospital" },
  { id: "lugar_acopio", title: "📦 Centro de acopio" },
];

const TIPO_LUGAR_LABEL = {
  lugar_particular: "Particular",
  lugar_hospital: "Hospital",
  lugar_acopio: "Centro de acopio",
};

const ESTATUS_LABEL = { en_stock: "🟢 En stock (lo vio en el inventario)", sin_stock: "🔴 Sin stock (no lo encontró)" };

function checklistProductos(productosMatch) {
  return productosMatch.map((p) => `${p.en_stock ? "✅" : "❌"} ${p.producto}`).join("\n");
}

async function finalizarPedido(from, data, productos) {
  const resultado = await registerPedido({
    nombre: data.nombre,
    telefono: data.telefono,
    direccion: data.direccion,
    tipo_lugar: data.tipo_lugar,
    estatus_inventario: data.estatus_inventario,
    productos,
    whatsappFrom: from,
  });

  const checklist = checklistProductos(resultado.productos);
  await sendReply(
    from,
    `🙏💛 ¡Ya registramos tu pedido! No estás solo/a en esto — nos vamos a contactar apenas podamos coordinar la entrega. 🚚✨\n\n` +
    `*Lo que pediste:* 📝\n${checklist}`
  );

  await notifyAdmin(
    `🆘 *Pedido nuevo* 📥\n` +
    `👤 ${data.nombre} — 📞 ${data.telefono}\n` +
    `📍 ${data.direccion} (${TIPO_LUGAR_LABEL[data.tipo_lugar] || data.tipo_lugar})\n` +
    `${ESTATUS_LABEL[data.estatus_inventario] || ""}\n\n` +
    `${checklist}\n\n📊 Cobertura: ${resultado.cobertura}`
  );
}

// ── Dispatcher de conversación ──────────────────────────────────────────────

async function handleIncomingMessage(from, msg) {
  const session = (await getSession(from)) || { estado: "inicio", data: {} };
  const estado = session.estado || "inicio";
  const data = session.data || {};

  const texto = msg.type === "text" ? (msg.text?.body || "").trim() : "";
  const buttonId = msg.type === "interactive"
    ? (msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id)
    : null;
  const esImagen = msg.type === "image";

  const quiereSalir = buttonId === "menu_salir" || texto.toLowerCase() === "salir";
  if (quiereSalir && (ESTADOS_SALIR_VOLUNTARIO.includes(estado) || ESTADOS_SALIR_AYUDA.includes(estado))) {
    const mensaje = ESTADOS_SALIR_VOLUNTARIO.includes(estado) ? MENSAJE_SALIDA_VOLUNTARIO : MENSAJE_SALIDA_AYUDA;
    await sendReply(from, mensaje);
    await clearSession(from);
    return;
  }

  switch (estado) {
    case "inicio": {
      await sendBienvenida(from);
      return;
    }

    case "esperando_membresia": {
      if (buttonId === "soy_voluntario") {
        await sendReply(from, "¡Genial! 🙌 Decime tu número de cédula (podés escribir 'salir' en cualquier momento para cortar):");
        await setSession(from, "esperando_cedula");
      } else if (buttonId === "necesito_ayuda") {
        await sendReply(from, "💛 Contamos con vos, queremos ayudarte. Primero mirá qué tenemos disponible ahora mismo 👇");
        await enviarInventarioTexto(from);
        await sendButtons(from, "¿Pudiste encontrar lo que buscabas? 🔎", [
          { id: "si_encontro", title: "✅ Sí" },
          { id: "no_encontro", title: "❌ No" },
        ]);
        await setSession(from, "post_inventario_ayuda");
      } else {
        await sendButtons(from, "Elegí una opción: 👇", BOTONES_MEMBRESIA);
      }
      return;
    }

    case "post_inventario_ayuda": {
      // Sea cual sea la respuesta, siempre terminamos registrando un pedido — la diferencia
      // es el estatus que queda guardado (si lo vio disponible o no en nuestro inventario).
      if (buttonId === "si_encontro" || buttonId === "no_encontro") {
        const estatus_inventario = buttonId === "si_encontro" ? "en_stock" : "sin_stock";
        const introChip = buttonId === "si_encontro"
          ? "¡Qué bueno que lo viste disponible! 🎉 "
          : "No te preocupes, igual te vamos a ayudar a conseguirlo 💪 ";
        await sendReply(from, `${introChip}Contame un poco de vos para poder ayudarte mejor 🙏. ¿Cuál es tu nombre y apellido? ✍️`);
        await setSession(from, "pedido_nombre", { estatus_inventario });
      } else {
        await sendButtons(from, "¿Pudiste encontrar lo que buscabas? 🔎", [
          { id: "si_encontro", title: "✅ Sí" },
          { id: "no_encontro", title: "❌ No" },
        ]);
      }
      return;
    }

    case "pedido_nombre": {
      if (!texto) { await sendReply(from, "Decime tu nombre y apellido: ✍️"); return; }
      await setSession(from, "pedido_telefono", { ...data, nombre: texto });
      await sendReply(from, "¿Cuál es tu número de teléfono de contacto? 📞");
      return;
    }

    case "pedido_telefono": {
      if (!texto) { await sendReply(from, "Decime tu número de teléfono de contacto: 📞"); return; }
      await setSession(from, "pedido_direccion", { ...data, telefono: texto });
      await sendReply(from, "¿Cuál es tu dirección? 📍");
      return;
    }

    case "pedido_direccion": {
      if (!texto) { await sendReply(from, "Decime tu dirección: 📍"); return; }
      await setSession(from, "pedido_tipo_lugar", { ...data, direccion: texto });
      await sendButtons(from, "¿Qué tipo de lugar sos? 🏡", TIPO_LUGAR_BOTONES);
      return;
    }

    case "pedido_tipo_lugar": {
      if (!TIPO_LUGAR_LABEL[buttonId]) {
        await sendButtons(from, "Elegí una opción: 👇", TIPO_LUGAR_BOTONES);
        return;
      }
      await setSession(from, "pedido_productos", { ...data, tipo_lugar: buttonId });
      await sendReply(
        from,
        "Contame qué necesitás 📝. Tratá de ser lo más específico posible — así nos ayudás a ayudarte mejor y más rápido 🙏💛 " +
        "(por ejemplo \"analgésicos\" 💊 en vez de \"medicina\", o \"ropa de niño talle 4\" 👕 en vez de \"ropa\")"
      );
      return;
    }

    case "pedido_productos": {
      if (!texto) { await sendReply(from, "Contame qué necesitás: 📝"); return; }
      const analisis = await analizarNecesidad(texto);
      if (!analisis.especifico) {
        await sendReply(from, `🤔 ${analisis.pregunta_aclaratoria || "¿Me lo podés detallar un poco más?"}`);
        return;
      }
      const productosAcumulados = [...(data.productos || []), ...analisis.productos];
      await sendButtons(
        from,
        `📝 Anotamos:\n${productosAcumulados.map((p) => `• ${p}`).join("\n")}\n\n¿Querés agregar algo más a tu pedido? ➕`,
        [
          { id: "agregar_mas", title: "➕ Sí, agregar" },
          { id: "finalizar_pedido", title: "✅ Ya está" },
        ]
      );
      await setSession(from, "pedido_confirmar_mas", { ...data, productos: productosAcumulados });
      return;
    }

    case "pedido_confirmar_mas": {
      if (buttonId === "agregar_mas") {
        await sendReply(from, "Contame qué otro insumo necesitás 📝");
        await setSession(from, "pedido_productos", data);
      } else if (buttonId === "finalizar_pedido") {
        await finalizarPedido(from, data, data.productos || []);
        await clearSession(from);
      } else {
        await sendButtons(from, "¿Querés agregar algo más a tu pedido? ➕", [
          { id: "agregar_mas", title: "➕ Sí, agregar" },
          { id: "finalizar_pedido", title: "✅ Ya está" },
        ]);
      }
      return;
    }

    case "esperando_cedula": {
      if (!texto) { await sendReply(from, "Escribime tu número de cédula (o 'salir' para cortar):"); return; }
      await setSession(from, "esperando_pin", { cedula: texto });
      await sendReply(from, "Ahora tu PIN de 4 dígitos:");
      return;
    }

    case "esperando_pin": {
      if (!texto) { await sendReply(from, "Escribime tu PIN de 4 dígitos 🔐 (o 'salir' para cortar):"); return; }
      const voluntario = await getVoluntario(data.cedula, texto);
      if (voluntario) {
        await sendMenu(from, voluntario.nombre);
      } else {
        await sendButtons(from, "❌ Cédula o PIN incorrectos.", [
          { id: "retry_login", title: "🔁 Reintentar" },
          { id: "back_menu", title: "↩️ Volver al menú" },
        ]);
        await setSession(from, "auth_fallida", data);
      }
      return;
    }

    case "auth_fallida": {
      if (buttonId === "retry_login") {
        await sendReply(from, "Decime tu número de cédula: 🪪");
        await setSession(from, "esperando_cedula");
      } else {
        await clearSession(from);
      }
      return;
    }

    case "menu": {
      if (buttonId === "menu_factura") {
        await sendReply(from, "Enviá la foto de la factura 📸🧾");
        await setSession(from, "esperando_foto_factura", data);
      } else if (buttonId === "menu_entrega") {
        await sendReply(from, "¿Número de factura de esta entrega? 🔢");
        await setSession(from, "esperando_num_entrega", data);
      } else if (buttonId === "menu_inventario") {
        await enviarInventarioTexto(from);
        await setSession(from, "menu", data);
      } else if (buttonId === "menu_necesidades") {
        await enviarNecesidadesTexto(from);
        await setSession(from, "menu", data);
      } else {
        await sendMenu(from, data.nombre);
      }
      return;
    }

    case "esperando_num_entrega": {
      if (!texto) { await sendReply(from, "Escribime el número de factura: 🔢"); return; }
      await setSession(from, "esperando_foto_entrega", { ...data, numero_factura: texto });
      await sendReply(from, "Enviá la foto de la entrega 📸🚚");
      return;
    }

    case "esperando_foto_factura": {
      if (buttonId === "back_menu") { await sendMenu(from, data.nombre); return; }
      if (!esImagen) {
        await sendButtons(from, "Mandame la foto de la factura 📸 o volvé al menú:", [{ id: "back_menu", title: "↩️ Volver al menú" }]);
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
        await sendButtons(from, "Mandame la foto de la entrega 📸 o volvé al menú:", [{ id: "back_menu", title: "↩️ Volver al menú" }]);
        return;
      }
      const { buffer, mimeType } = await downloadImage(msg.image.id);
      await handleEntrega(from, buffer, mimeType, data.numero_factura);
      await sendMenu(from, data.nombre);
      return;
    }

    default: {
      await clearSession(from);
      await sendBienvenida(from);
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
