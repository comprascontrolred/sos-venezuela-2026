import "dotenv/config";
import { google } from "googleapis";

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.JWT(
  credentials.client_email, null, credentials.private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;

const HEADERS = {
  DONACIONES:  [["id","donor_name","amount_usd","amount_original","currency","method","country","status","created_at","tx_hash"]],
  GASTOS:      [["id","numero_factura","fecha","proveedor","total","moneda","items_json","driveUrl","driveViewUrl","from"]],
  Entregas:    [["id","fecha","numero_factura","hospital","items_json","driveUrl","driveViewUrl","from"]],
  Inventario:  [["id","producto","cantidad","unidad","precio_unitario","ultima_actualizacion"]],
  Voluntarios: [["cedula","pin","nombre","activo"]],
  Sesiones:    [["from","estado","data_json","updated_at"]],
  Necesidades: [["id","descripcion","organizacion","prioridad","estado","fecha"]],
};

// Nombres actuales → nombres nuevos
const RENAMES = {
  "TRANSPARENCIA": "Entregas",
  "COMPROBANTES":  "Inventario",
};

async function run() {
  // 1. Obtener info del spreadsheet
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetList = data.sheets.map((s) => ({ id: s.properties.sheetId, title: s.properties.title }));
  console.log("Pestañas actuales:", sheetList.map((s) => s.title).join(", "));

  // 2. Renombrar pestañas si hace falta
  const renameRequests = [];
  for (const sheet of sheetList) {
    const newName = RENAMES[sheet.title.toUpperCase()] || RENAMES[sheet.title];
    if (newName) {
      renameRequests.push({
        updateSheetProperties: {
          properties: { sheetId: sheet.id, title: newName },
          fields: "title",
        },
      });
      console.log(`Renombrando: "${sheet.title}" → "${newName}"`);
    }
  }

  if (renameRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: renameRequests },
    });
  }

  // 3. Crear las pestañas que falten
  const { data: data2 } = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTitles = data2.sheets.map((s) => s.properties.title);
  const addRequests = Object.keys(HEADERS)
    .filter((tabName) => !existingTitles.includes(tabName))
    .map((tabName) => ({ addSheet: { properties: { title: tabName } } }));

  if (addRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: addRequests },
    });
    addRequests.forEach((r) => console.log(`➕ Pestaña creada: "${r.addSheet.properties.title}"`));
  }

  // 4. Escribir encabezados en cada pestaña
  const { data: data3 } = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const finalTitles = data3.sheets.map((s) => s.properties.title);
  console.log("Pestañas finales:", finalTitles.join(", "));

  for (const [tabName, headers] of Object.entries(HEADERS)) {
    if (!finalTitles.includes(tabName)) {
      console.warn(`⚠ Pestaña "${tabName}" no encontrada, saltando...`);
      continue;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: headers },
    });
    console.log(`✅ Encabezados escritos en "${tabName}"`);
  }

  console.log("\n✅ Google Sheets configurado correctamente.");
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
