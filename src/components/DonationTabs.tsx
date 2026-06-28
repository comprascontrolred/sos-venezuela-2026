import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Banknote, Globe, CreditCard, Building2, Loader2, X } from "lucide-react";
import DonationModal from "./DonationModal";

const API = import.meta.env.VITE_API_URL || "";

const MP_AMOUNTS = [1000, 2000, 5000, 10000];

function MPModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    const amount = selected ?? Number(custom);
    if (!amount || amount < 1) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/donations/mp/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, donor_name: "Donante" }),
      });
      const data = await res.json();
      if (data.init_point) window.location.href = data.init_point;
    } catch (err) {
      console.error("MP error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-md p-6 relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
          <X size={20} />
        </button>
        <p className="text-xs font-semibold text-brand uppercase tracking-widest mb-1">Donación</p>
        <h3 className="text-xl font-bold mb-5">Mercado Pago</h3>

        <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Elegí un monto (ARS)</p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {MP_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => { setSelected(a); setCustom(""); }}
              className={`py-2.5 rounded-xl text-sm font-bold border transition ${
                selected === a
                  ? "bg-brand/20 border-brand text-white"
                  : "border-dark-border text-gray-300 hover:border-brand/50"
              }`}
            >
              $ {a.toLocaleString("es-AR")}
            </button>
          ))}
        </div>

        <input
          type="number"
          min="1"
          placeholder="Otro monto en ARS"
          value={custom}
          onChange={(e) => { setCustom(e.target.value); setSelected(null); }}
          className="w-full bg-dark border border-dark-border rounded-lg px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-brand transition mb-5"
        />

        <p className="text-xs text-gray-500 mb-4">
          Serás redirigido a Mercado Pago para completar tu donación de forma segura.
        </p>

        <button
          onClick={handlePay}
          disabled={loading || (!selected && !custom)}
          className="flex items-center justify-center gap-2 w-full bg-[#009ee3] hover:bg-[#007bb5] disabled:opacity-50 text-white font-bold py-4 rounded-xl transition"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <CreditCard size={20} />}
          Pagar con Mercado Pago →
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function DonationTabs() {
  const [tab, setTab] = useState<"ar" | "intl">("ar");
  const [loading, setLoading] = useState(false);
  const [showMP, setShowMP] = useState(false);
  const [modal, setModal] = useState<{
    open: boolean;
    type: "local" | "international";
  }>({ open: false, type: "local" });

  async function handlePayPal() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/donations/paypal/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 10, donor_name: "Donor" }),
      });
      const data = await res.json();
      const approveLink = data.links?.find((l: { rel: string }) => l.rel === "approve");
      if (approveLink) window.location.href = approveLink.href;
    } catch (err) {
      console.error("PayPal error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="donar" className="px-4 py-20 max-w-2xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
        Donar ahora
      </h2>
      <p className="text-gray-400 text-center mb-8">
        Elige tu método. Cada aporte llega directo y documentado.
      </p>

      <div className="flex rounded-xl overflow-hidden border border-dark-border mb-8">
        {(["ar", "intl"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-semibold transition relative ${
              tab === t ? "text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === t && (
              <motion.div
                layoutId="tab-bg"
                className="absolute inset-0 bg-brand/20 border-b-2 border-brand"
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {t === "ar" ? <Banknote size={16} /> : <Globe size={16} />}
              {t === "ar" ? "Argentina (ARS)" : "Internacional (USD/EUR)"}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === "ar" ? (
          <>
            <button
              onClick={() => setShowMP(true)}
              className="flex items-center justify-center gap-3 w-full bg-[#009ee3] hover:bg-[#007bb5] text-white font-bold py-4 rounded-xl text-lg transition"
            >
              <CreditCard size={22} />
              Donar con Mercado Pago
            </button>
            <button
              onClick={() => setModal({ open: true, type: "local" })}
              className="flex items-center justify-center gap-3 w-full bg-dark-card border border-dark-border hover:border-brand/50 text-gray-300 hover:text-white font-medium py-3 rounded-xl transition"
            >
              <Building2 size={18} />
              Aviso de Transferencia Bancaria Local
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handlePayPal}
              disabled={loading}
              className="flex items-center justify-center gap-3 w-full bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold py-4 rounded-xl text-lg transition disabled:opacity-60"
            >
              {loading ? <Loader2 size={22} className="animate-spin" /> : <CreditCard size={22} />}
              Donar con PayPal
            </button>
            <button
              onClick={() => setModal({ open: true, type: "international" })}
              className="flex items-center justify-center gap-3 w-full bg-dark-card border border-dark-border hover:border-brand/50 text-gray-300 hover:text-white font-medium py-3 rounded-xl transition"
            >
              <Building2 size={18} />
              Aviso de Transferencia Internacional
            </button>
          </>
        )}
      </div>

      <DonationModal
        open={modal.open}
        onClose={() => setModal({ ...modal, open: false })}
        type={modal.type}
      />

      <AnimatePresence>
        {showMP && <MPModal onClose={() => setShowMP(false)} />}
      </AnimatePresence>
    </section>
  );
}
