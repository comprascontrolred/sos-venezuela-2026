import { supabase } from "../config/supabase.js";

export async function list(req, res) {
  try {
    let query = supabase
      .from("transparency_items")
      .select("*")
      .order("date", { ascending: false });

    const { type } = req.query;
    if (type) query = query.eq("type", type);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("Transparency list error:", err);
    res.status(500).json({ error: "Error fetching transparency items" });
  }
}

export async function create(req, res) {
  try {
    const { type, title, description, image_url, doc_url, date } = req.body;

    const { data, error } = await supabase
      .from("transparency_items")
      .insert({ type, title, description, image_url, doc_url, date })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error("Transparency create error:", err);
    res.status(500).json({ error: "Error creating transparency item" });
  }
}
