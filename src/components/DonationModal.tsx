import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Upload, CheckCircle, Loader2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface Props {
  open: boolean;
  onClose: () => void;
  type: "local" | "international";
}

const BANK_DATA = {
  local: {
    title: "Transferencia Bancaria (Argentina)",
    fields: [
      { label: "Banco", value: "Banco XXXX" },
      { label: "CBU", value: "0000000000000000000000" },
      { label: "Alias", value: "DONACION.VENEZUELA.AYUDA" },
      { label: "Titular", value: "Consorcio Redvision S.A." },
      { label: "CUIT", value: "30-XXXXXXXX-X" },
    ],
  },
  international: {
    title: "Transferencia Internacional (USD/EUR)",
    fields: [
      { label: "Bank", value: "International Bank XXXX" },
      { label: "SWIFT/BIC", value: "XXXXUSXX" },
      { label: "Account Number", value: "XXXX-XXXX-XXXX" },
      { label: "Beneficiary", value: "Consorcio Redvision S.A." },
      { label: "Reference", value: "DONACION-VEN" },
    ],
  },
};

export default function DonationModal({ open, onClose, type }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const data = BANK_DATA[type];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      let receiptUrl = "";
      const file = fileRef.current?.files?.[0];
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch(`${API}/api/upload`, { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        receiptUrl = uploadData.url || "";
      }

      const form = e.target as HTMLFormElement;
      const amountInput = form.querySelector("input[type=number]") as HTMLInputElement;

      await fetch(`${API}/api/donations/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amountInput.value),
          currency: type === "local" ? "ARS" : "USD",
          donor_name: "Donante",
          country: type === "local" ? "AR" : "INT",
          receipt_url: receiptUrl,
        }),
      });

      setStatus("done");
    } catch (err) {
      console.error("Transfer submit error:", err);
      setStatus("idle");
    }
  }

  function handleClose() {
    setStatus("idle");
    setFileName("");
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-md p-6 relative"
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-bold mb-4">{data.title}</h3>

            <div className="space-y-2 mb-6">
              {data.fields.map((f) => (
                <div
                  key={f.label}
                  className="flex justify-between text-sm bg-dark/50 rounded-lg px-3 py-2"
                >
                  <span className="text-gray-400">{f.label}</span>
                  <span className="font-mono text-gray-200 select-all">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>

            {status === "done" ? (
              <div className="text-center py-6">
                <CheckCircle className="mx-auto text-green-400 mb-2" size={48} />
                <p className="text-green-400 font-semibold text-lg">
                  Comprobante enviado
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Lo verificaremos a la brevedad.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Monto transferido
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder={type === "local" ? "$ ARS" : "$ USD/EUR"}
                    className="w-full bg-dark border border-dark-border rounded-lg px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-brand transition"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Comprobante de transferencia
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      setFileName(e.target.files?.[0]?.name || "")
                    }
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full bg-dark border border-dashed border-dark-border rounded-lg px-4 py-3 text-gray-400 hover:border-brand/50 transition flex items-center justify-center gap-2"
                  >
                    <Upload size={16} />
                    {fileName || "Subir comprobante"}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3 rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar aviso de transferencia"
                  )}
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
