import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Camera } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface AuditItem {
  id: string;
  type: "factura" | "entrega";
  title: string;
  image_url: string;
  date: string;
}

type Filter = "Todo" | "factura" | "entrega";

const FILTERS: { label: string; value: Filter; icon: typeof FileText }[] = [
  { label: "Todo", value: "Todo", icon: Camera },
  { label: "Facturas de Compra", value: "factura", icon: FileText },
  { label: "Fotos de Entregas", value: "entrega", icon: Camera },
];

export default function TransparencyGallery() {
  const [filter, setFilter] = useState<Filter>("Todo");
  const [items, setItems] = useState<AuditItem[]>([]);

  useEffect(() => {
    const params = filter === "Todo" ? "" : `?type=${filter}`;
    fetch(`${API}/api/transparency${params}`)
      .then((r) => r.json())
      .then(setItems)
      .catch(console.error);
  }, [filter]);

  const filtered = items;

  return (
    <section id="auditoria" className="px-4 py-20 max-w-6xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
        Auditoría Pública
      </h2>
      <p className="text-gray-400 text-center mb-8 max-w-2xl mx-auto">
        Cada peso se documenta. Facturas de compra y fotos de entregas,
        verificadas y publicadas con IA.
      </p>

      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
              filter === f.value
                ? "bg-brand text-white"
                : "bg-dark-card border border-dark-border text-gray-400 hover:text-white"
            }`}
          >
            <f.icon size={14} />
            {f.label}
          </button>
        ))}
      </div>

      <motion.div
        layout
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="relative group rounded-xl overflow-hidden bg-dark-card border border-dark-border"
            >
              <img
                src={item.image_url}
                alt={`${item.type} - ${item.date}`}
                className="w-full h-56 object-cover"
                loading="lazy"
              />
              <div className="absolute top-2 left-2 flex gap-2">
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-md ${
                    item.type === "factura"
                      ? "bg-brand/80 text-white"
                      : "bg-gold/80 text-black"
                  }`}
                >
                  {item.type === "factura" ? "Factura" : "Entrega"}
                </span>
                <span className="text-xs bg-black/60 text-white px-2 py-1 rounded-md backdrop-blur-sm">
                  {item.date}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
