import { sheets, SPREADSHEET_ID } from "../config/google.js";
import { v4 as uuid } from "uuid";

// ── Similitud de productos (Jaccard sobre tokens) ──────────────────────────
export function similarity(a, b) {
  const tokens = (s) => new Set(s.toLowerCase().replace(/[^a-záéíóúñ0-9]/gi, " ").trim().split(/\s+/).filter(Boolean));
  const ta = tokens(a);
  const tb = tokens(b);
  const intersection = [...ta].filter((w) => tb.has(w)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

// ── Donaciones ─────────────────────────────────────────────────────────────

export async function registerDonation({ donor_name, amount_usd, amount_original, currency, method, country, status, tx_hash, fee_usd }) {
  const id = uuid();
  const fecha = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Donaciones!A:K",
    valueInputOption: "RAW",
    requestBody: {
      values: [[id, donor_name ?? "Anónimo", amount_usd, amount_original ?? amount_usd, currency, method, country ?? "INT", status, fecha, tx_hash ?? "", fee_usd ?? 0]],
    },
  });

  return { id, donor_name, amount_usd, amount_original, currency, method, country, status, created_at: fecha, tx_hash, fee_usd: fee_usd ?? 0 };
}

export async function getDonations() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Donaciones!A:K" });
  const rows = res.data.values ?? [];
  const headers = ["id","donor_name","amount_usd","amount_original","currency","method","country","status","created_at","tx_hash","fee_usd"];
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

// ── Gastos / Facturas ──────────────────────────────────────────────────────

export async function getNextFacturaNumber() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Gastos!A:A" });
  const rows = res.data.values ?? [];
  return Math.max(rows.length - 1, 0) + 1; // fila 1 = encabezado
}

export async function registerFactura({ proveedor, fecha, total, moneda, items, driveUrl, driveViewUrl, whatsappFrom }) {
  const id = uuid();
  const numero = await getNextFacturaNumber();
  const ts = fecha || new Date().toISOString().split("T")[0];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Gastos!A:J",
    valueInputOption: "RAW",
    requestBody: {
      values: [[id, numero, ts, proveedor ?? "", total ?? "", moneda ?? "USD", JSON.stringify(items ?? []), driveUrl, driveViewUrl, whatsappFrom]],
    },
  });

  return { id, numero, ts, proveedor, total, moneda, items };
}

export async function getFacturas() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Gastos!A:J" });
  const rows = res.data.values ?? [];
  const headers = ["id","numero_factura","fecha","proveedor","total","moneda","items_json","driveUrl","driveViewUrl","from"];
  return rows.slice(1).map((r) => {
    const obj = Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]));
    try { obj.items = JSON.parse(obj.items_json); } catch { obj.items = []; }
    return obj;
  });
}

export async function getFacturaByNumber(numero) {
  const facturas = await getFacturas();
  return facturas.find((f) => Number(f.numero_factura) === Number(numero)) || null;
}

export async function getGastos() {
  return getFacturas();
}

// ── Inventario ─────────────────────────────────────────────────────────────

export async function getInventario() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Inventario!A:F" });
  const rows = res.data.values ?? [];
  const headers = ["id","producto","cantidad","unidad","precio_unitario","ultima_actualizacion"];
  return rows.slice(1).map((r, i) => ({
    ...Object.fromEntries(headers.map((h, j) => [h, r[j] ?? ""])),
    _row: i + 2, // fila real en el sheet (1-indexed, +1 por encabezado)
  }));
}

export async function upsertInventarioItem({ producto, cantidad, unidad, precio_unitario }) {
  const inventario = await getInventario();
  const ahora = new Date().toISOString().split("T")[0];

  // Buscar producto con 95%+ de similitud
  const match = inventario.find((item) => similarity(item.producto, producto) >= 0.95);

  if (match) {
    const nuevaCantidad = Number(match.cantidad) + Number(cantidad);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Inventario!C${match._row}:F${match._row}`,
      valueInputOption: "RAW",
      requestBody: { values: [[nuevaCantidad, unidad ?? match.unidad, precio_unitario ?? match.precio_unitario, ahora]] },
    });
    return { action: "updated", producto: match.producto, cantidad: nuevaCantidad };
  }

  // Producto nuevo
  const id = uuid();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Inventario!A:F",
    valueInputOption: "RAW",
    requestBody: { values: [[id, producto, cantidad, unidad ?? "", precio_unitario ?? "", ahora]] },
  });
  return { action: "created", producto, cantidad };
}

export async function deductInventarioItems(items) {
  const inventario = await getInventario();
  const ahora = new Date().toISOString().split("T")[0];

  for (const item of items) {
    const match = inventario.find((inv) => similarity(inv.producto, item.producto) >= 0.90);
    if (!match) continue;

    const nuevaCantidad = Math.max(0, Number(match.cantidad) - Number(item.cantidad));
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Inventario!C${match._row}:F${match._row}`,
      valueInputOption: "RAW",
      requestBody: { values: [[nuevaCantidad, match.unidad, match.precio_unitario, ahora]] },
    });
  }
}

// ── Entregas ───────────────────────────────────────────────────────────────

export async function registerEntrega({ numero_factura, hospital, items, driveUrl, driveViewUrl, whatsappFrom }) {
  const id = uuid();
  const fecha = new Date().toISOString().split("T")[0];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Entregas!A:H",
    valueInputOption: "RAW",
    requestBody: {
      values: [[id, fecha, numero_factura ?? "", hospital ?? "", JSON.stringify(items ?? []), driveUrl, driveViewUrl, whatsappFrom]],
    },
  });
  return { id, fecha, numero_factura, hospital, items };
}

export async function getEntregas() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Entregas!A:H" });
  const rows = res.data.values ?? [];
  const headers = ["id","fecha","numero_factura","hospital","items_json","driveUrl","driveViewUrl","from"];
  return rows.slice(1).map((r) => {
    const obj = Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]));
    try { obj.items = JSON.parse(obj.items_json); } catch { obj.items = []; }
    return obj;
  });
}

// ── Voluntarios ────────────────────────────────────────────────────────────

// Deja solo dígitos: acepta "25.123.456", "25-123-456", "V-25123456" o el número corrido.
function soloDigitos(s) {
  return String(s ?? "").replace(/\D/g, "");
}

export async function getVoluntario(cedula, pin) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Voluntarios!A:D" });
  const rows = res.data.values ?? [];
  const headers = ["cedula", "pin", "nombre", "activo"];
  const voluntarios = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));

  const cedulaBuscada = soloDigitos(cedula);
  const match = voluntarios.find((v) => soloDigitos(v.cedula) === cedulaBuscada && String(v.pin).trim() === String(pin).trim());
  if (!match) return null;
  if (String(match.activo).trim().toUpperCase() !== "SI" && String(match.activo).trim().toUpperCase() !== "TRUE") return null;
  return { nombre: match.nombre };
}

// ── Sesiones de WhatsApp ───────────────────────────────────────────────────

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos

async function findSessionRow(from) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Sesiones!A:D" });
  const rows = res.data.values ?? [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === from) return { row: i + 1, values: rows[i] };
  }
  return null;
}

export async function getSession(from) {
  const found = await findSessionRow(from);
  if (!found) return null;

  const [, estado, dataJson, updatedAt] = found.values;
  if (updatedAt && Date.now() - new Date(updatedAt).getTime() > SESSION_TIMEOUT_MS) return null;

  let data = {};
  try { data = JSON.parse(dataJson || "{}"); } catch { data = {}; }
  return { estado, data, updated_at: updatedAt };
}

export async function setSession(from, estado, data = {}) {
  const ahora = new Date().toISOString();
  const values = [[from, estado, JSON.stringify(data), ahora]];
  const found = await findSessionRow(from);

  if (found) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Sesiones!A${found.row}:D${found.row}`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sesiones!A:D",
      valueInputOption: "RAW",
      requestBody: { values },
    });
  }
}

export async function clearSession(from) {
  const found = await findSessionRow(from);
  if (!found) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Sesiones!A${found.row}:D${found.row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[from, "", "", ""]] },
  });
}

// ── Necesidades (cargadas a mano por quien gestiona las compras) ───────────

export async function getNecesidades() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Necesidades!A:F" });
  const rows = res.data.values ?? [];
  const headers = ["id", "descripcion", "organizacion", "prioridad", "estado", "fecha"];
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

// ── Uso de Gemini (para el comando "tokens" del admin) ──────────────────────

export async function registerUsoGemini({ tipo, tokens_prompt, tokens_respuesta, tokens_total }) {
  const ahora = new Date();
  const fecha = ahora.toISOString().split("T")[0];
  const hora = ahora.toISOString().split("T")[1].slice(0, 8);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "UsoGemini!A:G",
    valueInputOption: "RAW",
    requestBody: {
      values: [[uuid(), fecha, hora, tipo, tokens_prompt ?? 0, tokens_respuesta ?? 0, tokens_total ?? 0]],
    },
  });
}

export async function getUsoGeminiHoy() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "UsoGemini!A:G" });
  const rows = res.data.values ?? [];
  const headers = ["id", "fecha", "hora", "tipo", "tokens_prompt", "tokens_respuesta", "tokens_total"];
  const hoy = new Date().toISOString().split("T")[0];

  const registros = rows.slice(1)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])))
    .filter((r) => r.fecha === hoy);

  const porTipo = {};
  let tokensTotal = 0;
  for (const r of registros) {
    porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1;
    tokensTotal += Number(r.tokens_total) || 0;
  }

  return { llamadas: registros.length, tokensTotal, porTipo };
}

// ── Pedidos (gente externa que pide ayuda por WhatsApp) ─────────────────────

const PEDIDO_MATCH_THRESHOLD = 0.3; // más laxo que facturas: acá es lenguaje natural, no OCR

async function matchearProductos(productos) {
  const inventario = await getInventario();
  return productos.map((producto) => ({
    producto,
    en_stock: inventario.some((item) => similarity(item.producto, producto) >= PEDIDO_MATCH_THRESHOLD),
  }));
}

function calcularCobertura(productosMatch) {
  if (productosMatch.every((p) => p.en_stock)) return "total";
  if (productosMatch.some((p) => p.en_stock)) return "parcial";
  return "ninguna";
}

export async function registerPedido({ nombre, telefono, direccion, tipo_lugar, estatus_inventario, productos, whatsappFrom }) {
  const id = uuid();
  const fecha = new Date().toISOString().split("T")[0];
  const productosMatch = await matchearProductos(productos);
  const cobertura = calcularCobertura(productosMatch);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Pedidos!A:J",
    valueInputOption: "RAW",
    requestBody: {
      values: [[id, fecha, nombre ?? "", telefono ?? "", direccion ?? "", tipo_lugar ?? "", estatus_inventario ?? "", JSON.stringify(productosMatch), cobertura, whatsappFrom]],
    },
  });

  return { id, cobertura, productos: productosMatch };
}

export async function getPedidos() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "Pedidos!A:J" });
  const rows = res.data.values ?? [];
  const headers = ["id", "fecha", "nombre", "telefono", "direccion", "tipo_lugar", "estatus_inventario", "productos_json", "cobertura", "from"];
  return rows.slice(1).map((r, i) => {
    const obj = Object.fromEntries(headers.map((h, j) => [h, r[j] ?? ""]));
    try { obj.productos = JSON.parse(obj.productos_json); } catch { obj.productos = []; }
    obj._row = i + 2;
    return obj;
  });
}

export async function revisarPedidosPendientes() {
  const pedidos = (await getPedidos()).filter((p) => p.cobertura !== "total");
  const cubiertosAhora = [];

  for (const pedido of pedidos) {
    const nombresProductos = pedido.productos.map((p) => p.producto);
    const productosMatch = await matchearProductos(nombresProductos);
    const cobertura = calcularCobertura(productosMatch);

    if (cobertura !== pedido.cobertura) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `Pedidos!H${pedido._row}:I${pedido._row}`,
        valueInputOption: "RAW",
        requestBody: { values: [[JSON.stringify(productosMatch), cobertura]] },
      });
    }

    if (cobertura === "total" && pedido.cobertura !== "total") {
      cubiertosAhora.push({ nombre: pedido.nombre, telefono: pedido.telefono, direccion: pedido.direccion });
    }
  }

  return cubiertosAhora;
}

// ── Transparencia pública ──────────────────────────────────────────────────

export async function getTransparencia() {
  const [facturas, entregas] = await Promise.all([getFacturas(), getEntregas()]);

  return facturas.map((f) => ({
    ...f,
    entregas: entregas.filter((e) => Number(e.numero_factura) === Number(f.numero_factura)),
  })).sort((a, b) => Number(b.numero_factura) - Number(a.numero_factura));
}
