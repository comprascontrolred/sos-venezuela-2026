import { motion } from "framer-motion";
import { Heart, ChevronDown, Mail, MessageCircle, Shield } from "lucide-react";
import LiveTicker from "./components/LiveTicker";
import DonationTabs from "./components/DonationTabs";
import TransparencyGallery from "./components/TransparencyGallery";

function App() {
  return (
    <div className="min-h-screen">
      <LiveTicker />

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand/20 via-dark to-dark" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(230,57,70,0.15),transparent_70%)]" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 text-center px-4 max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 bg-brand/20 border border-brand/30 text-brand rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <Heart size={14} className="fill-current" />
            Campaña de emergencia activa
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">
            Doble Terremoto en Venezuela:{" "}
            <span className="text-brand">Ayuda Urgente</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10">
            Cada donación es rastreada, verificada y publicada. Transparencia
            total respaldada por Redvision, Control Red y Caracas Market.
          </p>

          <a
            href="#donar"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white font-bold text-lg px-8 py-4 rounded-xl transition transform hover:scale-105"
          >
            Quiero donar ahora
            <ChevronDown size={20} />
          </a>
        </motion.div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown size={24} className="text-gray-600" />
        </div>
      </section>

      {/* ── Sponsors ── */}
      <section className="py-12 border-y border-dark-border">
        <p className="text-center text-sm text-gray-500 uppercase tracking-widest mb-6">
          Iniciativa respaldada por
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 px-4">
          {["Redvision", "Control Red", "Caracas Market"].map((name) => (
            <div
              key={name}
              className="bg-dark-card border border-dark-border rounded-xl px-6 py-3 text-gray-400 font-semibold text-lg"
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* ── Contexto ── */}
      <section className="px-4 py-20 max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">
            La crisis es real
          </h2>
          <div className="space-y-4 text-gray-400 leading-relaxed text-lg">
            <p>
              El doble terremoto que sacudió Venezuela dejó comunidades enteras
              sin acceso a agua, alimentos ni refugio. Miles de familias
              perdieron todo en cuestión de minutos. La infraestructura
              colapsada dificulta el acceso de ayuda humanitaria a las zonas
              más afectadas.
            </p>
            <p>
              Esta campaña nace de un consorcio de empresas comprometidas con
              la transparencia absoluta. Cada peso recaudado se documenta
              públicamente: desde la factura de compra de insumos hasta la
              foto de entrega en terreno. Los fondos se canalizan a
              Venezuela a través de plataformas reguladas como Astro Pay y
              Brubank.
            </p>
          </div>
        </motion.div>
      </section>

      {/* ── Donación ── */}
      <div className="bg-dark-card/50 border-y border-dark-border">
        <DonationTabs />
      </div>

      {/* ── Auditoría ── */}
      <TransparencyGallery />

      {/* ── Footer ── */}
      <footer className="border-t border-dark-border px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
            <div className="flex items-center gap-2 text-xl font-bold">
              <Heart size={20} className="text-brand fill-brand" />
              Venezuela Te Abraza
            </div>
            <div className="flex gap-4">
              {[
                { icon: Mail, label: "Email" },
                { icon: Heart, label: "Instagram" },
                { icon: MessageCircle, label: "WhatsApp" },
              ].map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="bg-dark-card border border-dark-border rounded-lg p-2.5 text-gray-400 hover:text-white hover:border-brand/50 transition"
                >
                  <Icon size={18} />
                </a>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-3 bg-dark-card border border-dark-border rounded-xl p-4 mb-6">
            <Shield size={20} className="text-brand flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-400">
              <span className="text-white font-semibold">
                Compromiso de transparencia:
              </span>{" "}
              Todos los fondos recaudados son auditables públicamente. Las
              facturas de compra y fotos de entrega son verificadas
              mediante inteligencia artificial y publicadas en la sección de
              Auditoría Pública de esta página.
            </p>
          </div>

          <p className="text-center text-xs text-gray-600">
            &copy; {new Date().getFullYear()} Consorcio Redvision &middot;
            Control Red &middot; Caracas Market. Todos los derechos
            reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
