import { supabase } from "../config/supabase.js";
import crypto from "node:crypto";

export async function upload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const ext = req.file.originalname.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "comprobantes";

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    res.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
}
