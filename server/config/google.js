import { google } from "googleapis";

// La credencial del service account se carga SOLO desde variables de entorno
// (nunca desde un archivo en la imagen). Acepta dos formatos:
//   - GOOGLE_SERVICE_ACCOUNT_JSON_B64: el JSON codificado en base64 (recomendado;
//     evita problemas de escaping de comillas/saltos al cargar el secret).
//   - GOOGLE_SERVICE_ACCOUNT_JSON: el JSON en texto plano (una línea).
const rawCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64
  ? Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64, "base64").toString("utf8")
  : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (!rawCredentials) {
  throw new Error(
    "Falta la credencial de Google: definí GOOGLE_SERVICE_ACCOUNT_JSON_B64 o GOOGLE_SERVICE_ACCOUNT_JSON."
  );
}

const credentials = JSON.parse(rawCredentials);

// Service account (JWT) → Sheets. El service account tiene acceso a la planilla.
export const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ]
);

// OAuth (cuenta personal) → Drive. Los service accounts no tienen cuota de
// almacenamiento propia, así que las subidas se hacen en nombre del usuario.
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });

export const sheets = google.sheets({ version: "v4", auth });
export const drive  = google.drive({ version: "v3", auth: oauth2Client });

export const SPREADSHEET_ID  = process.env.GOOGLE_SHEETS_ID;
export const DRIVE_FOLDER_FACTURAS  = process.env.DRIVE_FOLDER_FACTURAS;
export const DRIVE_FOLDER_ENTREGAS  = process.env.DRIVE_FOLDER_ENTREGAS;
