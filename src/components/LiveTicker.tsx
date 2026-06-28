import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = import.meta.env.VITE_API_URL || "";

interface Donation {
  id: string | number;
  name: string;
  amount: number;
  currency: string;
}

export default function LiveTicker() {
  const [donations, setDonations] = useState<Donation[]>([]);

  useEffect(() => {
    const es = new EventSource(`${API}/api/donations/live`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.connected) return;
      setDonations((prev) => [data, ...prev.slice(0, 5)]);
    };

    return () => es.close();
  }, []);

  return (
    <div className="fixed right-4 top-1/3 z-50 hidden lg:flex flex-col gap-2 max-w-[220px]">
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1 text-center">
        Donaciones recientes
      </div>
      <AnimatePresence mode="popLayout">
        {donations.map((d) => (
          <motion.div
            key={d.id}
            initial={{ opacity: 0, x: 60, scale: 0.8 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.8 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="bg-dark-card/90 backdrop-blur border border-dark-border rounded-xl px-3 py-2 text-sm"
          >
            <span className="mr-1">&#128100;</span>
            <span className="text-gray-300">{d.name}</span>{" "}
            <span className="text-gold font-bold">
              {d.currency === "ARS" ? "$" : "US$"}
              {d.amount.toLocaleString()}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
