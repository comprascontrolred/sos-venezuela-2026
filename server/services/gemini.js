import { GoogleGenerativeAI } from "@google/generative-ai";
import { registerUsoGemini } from "./sheetsAgent.js";

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: "gemini-2.5-flash" });

async function generarYRegistrar(tipo, contenido) {
  const result = await model.generateContent(contenido);
  const usage = result.response.usageMetadata || {};
  registerUsoGemini({
    tipo,
    tokens_prompt: usage.promptTokenCount ?? 0,
    tokens_respuesta: usage.candidatesTokenCount ?? 0,
    tokens_total: usage.totalTokenCount ?? 0,
  }).catch((err) => console.error("[Gemini] Error registrando uso:", err.message));
  return result;
}

const FACTURA_PROMPT = `Analizá esta imagen de factura/recibo/ticket de compra.
Respondé SOLO con JSON válido, sin markdown ni texto extra:
{
  "tipo": "factura",
  "proveedor": string,
  "fecha": "YYYY-MM-DD" | null,
  "total": number | null,
  "moneda": "USD" | "ARS" | "VES" | null,
  "items": [
    {
      "producto": string,
      "cantidad": number,
      "unidad": string | null,
      "precio_unitario": number | null
    }
  ]
}
- proveedor: nombre de la farmacia, droguería o tienda
- items: TODOS los productos visibles en la factura
- unidad: "unidades", "cajas", "ampollas", "frascos", etc. null si no figura
- precio_unitario: precio por unidad si figura, sino null
- Si no podés leer algún campo, usá null`;

const ENTREGA_PROMPT = (caption) => `El voluntario envió esta foto con el mensaje: "${caption}"
Respondé SOLO con JSON válido, sin markdown ni texto extra:
{
  "tipo": "entrega",
  "numero_factura": number | null,
  "hospital": string | null,
  "descripcion": string
}
- numero_factura: el número de factura mencionado en el mensaje
- hospital: nombre exacto del hospital mencionado
- descripcion: resumen breve de la entrega (máx 80 caracteres)`;

const NECESIDAD_PROMPT = (texto) => `Una persona que necesita ayuda humanitaria en Venezuela escribió esto para pedir insumos por WhatsApp: "${texto}"

Respondé SOLO con JSON válido, sin markdown ni texto extra:
{
  "especifico": boolean,
  "productos": string[],
  "pregunta_aclaratoria": string | null
}
- especifico: false si la descripción es demasiado genérica para salir a comprar algo puntual (ej. "ropa", "medicina", "comida" a secas, sin ningún detalle).
- productos: si especifico es true, la lista de productos ya normalizados (separá si mencionó varios). Si especifico es false, dejá un array vacío.
- pregunta_aclaratoria: si especifico es false, una pregunta corta y cálida (nunca fría ni tipo formulario) pidiendo precisar. Ejemplos: "¿Qué tipo de ropa necesitás — para hombre, mujer o niño?", "¿Qué tipo de medicamento — analgésico, antibiótico, etc.?". Si especifico es true, null.`;

export async function analizarNecesidad(texto) {
  const result = await generarYRegistrar("necesidad", NECESIDAD_PROMPT(texto));
  const text = result.response.text().trim().replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

function isEntrega(caption) {
  if (!caption) return false;
  const c = caption.toLowerCase();
  return c.includes("entrega") && (c.includes("factura") || c.includes("hospital"));
}

export async function analyzeFactura(imageBase64, mimeType = "image/jpeg") {
  const result = await generarYRegistrar("factura", [
    { inlineData: { data: imageBase64, mimeType } },
    FACTURA_PROMPT,
  ]);
  const text = result.response.text().trim().replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

export async function analyzeEntrega(imageBase64, mimeType = "image/jpeg", caption) {
  const result = await generarYRegistrar("entrega", [
    { inlineData: { data: imageBase64, mimeType } },
    ENTREGA_PROMPT(caption),
  ]);
  const text = result.response.text().trim().replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}

export async function classifyAndAnalyze(imageBase64, mimeType = "image/jpeg", caption = "") {
  if (isEntrega(caption)) {
    return analyzeEntrega(imageBase64, mimeType, caption);
  }
  return analyzeFactura(imageBase64, mimeType);
}
