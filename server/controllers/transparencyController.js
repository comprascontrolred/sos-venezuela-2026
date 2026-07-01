import { getTransparencia, getInventario } from "../services/sheetsAgent.js";

export async function listTransparency(req, res) {
  try {
    const data = await getTransparencia();
    // Vista pública: ocultar el número de WhatsApp del voluntario (dato personal).
    const publico = data.map(({ from, ...factura }) => ({
      ...factura,
      entregas: (factura.entregas || []).map(({ from, ...entrega }) => entrega),
    }));
    res.json(publico);
  } catch (err) {
    console.error("[transparency] Error:", err.message);
    res.status(500).json({ error: "Error al leer transparencia" });
  }
}

export async function listInventario(req, res) {
  try {
    const items = await getInventario();
    res.json(items.map(({ _row, ...rest }) => rest));
  } catch (err) {
    console.error("[inventario] Error:", err.message);
    res.status(500).json({ error: "Error al leer inventario" });
  }
}
