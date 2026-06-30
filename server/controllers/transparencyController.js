import { getTransparencia, getInventario } from "../services/sheetsAgent.js";

export async function listTransparency(req, res) {
  try {
    const data = await getTransparencia();
    res.json(data);
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
