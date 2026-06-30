import { Readable } from "stream";
import { drive, DRIVE_FOLDER_FACTURAS, DRIVE_FOLDER_ENTREGAS } from "../config/google.js";

const DRIVE_FOLDER_INVENTARIO = process.env.DRIVE_FOLDER_INVENTARIO;

export async function uploadToDrive(imageBuffer, filename, tipo) {
  const folderId = tipo === "factura"
    ? DRIVE_FOLDER_FACTURAS
    : tipo === "entrega"
    ? DRIVE_FOLDER_ENTREGAS
    : DRIVE_FOLDER_INVENTARIO;

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType: "image/jpeg", body: Readable.from(imageBuffer) },
    fields: "id, webViewLink",
  });

  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: { role: "reader", type: "anyone" },
  });

  const publicUrl = `https://drive.google.com/uc?id=${res.data.id}`;
  return { fileId: res.data.id, url: publicUrl, viewUrl: res.data.webViewLink };
}
