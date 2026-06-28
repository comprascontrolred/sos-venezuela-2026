# Prompt inicial para Claude Code — Backend SOS Venezuela

Pegá esto en Claude Code al abrir el proyecto:

---

Tengo una landing de donaciones de emergencia llamada **SOS Venezuela** (terremoto Caracas, 24 jun 2026). El frontend ya está terminado en `Landing Donaciones Caracas.dc.html` — es HTML/CSS/JS vanilla sin frameworks.

Necesito que construyas el backend completo. Lee el `README.md` del proyecto para entender la arquitectura antes de escribir código.

## Stack que quiero usar
- **Runtime:** Node.js 20 + Express
- **Base de datos:** Supabase (PostgreSQL)
- **Pagos:** Mercado Pago SDK + PayPal REST API
- **Sheets:** Google Sheets API v4 (fuente de verdad para transparencia)
- **Storage:** Supabase Storage (comprobantes JPG/PDF)
- **Tiempo real:** Server-Sent Events (SSE) para el ticker de donaciones en vivo
- **Deploy:** Railway o Render

## Lo que necesito que construyas

### Paso 1 — Estructura del proyecto
Creá la estructura de carpetas del backend:
```
/server
  /routes
  /controllers
  /services
  /middlewares
  /config
  index.js
.env.example
package.json
```

### Paso 2 — Base de datos (Supabase)
Creá el schema SQL para estas tablas:
- `donations` (id, donor_name, amount_usd, amount_original, currency, method, country, status, created_at)
- `expenses` (id, description, amount_usd, category, receipt_url, created_at)
- `transparency_items` (id, type, title, description, image_url, doc_url, date, created_at)
- `exchange_rates` (id, usd_ars, source, fetched_at)

### Paso 3 — Endpoints principales

**Donaciones:**
- `POST /api/donations/mp/create` → crea preferencia Mercado Pago, devuelve init_point
- `POST /api/donations/mp/webhook` → recibe notificación MP, marca como aprobada
- `POST /api/donations/paypal/create` → crea orden PayPal
- `POST /api/donations/paypal/capture` → captura pago PayPal
- `POST /api/donations/transfer` → registra transferencia manual + sube comprobante

**Consolidado:**
- `GET /api/summary` → { totalRaised, totalExpenses, taxes, balance, donationsCount, lastDonation }

**Ticker en vivo (SSE):**
- `GET /api/donations/live` → stream SSE, emite cada nueva donación aprobada en tiempo real

**Transparencia:**
- `GET /api/transparency` → lista items (filtro por type: factura/entrega)
- `POST /api/transparency` → agrega item nuevo (admin)

**Tipo de cambio:**
- `GET /api/exchange-rate` → { usdArs, updatedAt } — cachea 1 hora, fuente BCRA

**Upload:**
- `POST /api/upload` → sube archivo a Supabase Storage, devuelve URL pública

### Paso 4 — Conectar el frontend
En el HTML del frontend hay estas secciones que hay que conectar a los endpoints reales:

1. **Ticker de donaciones** — actualmente simula con `setInterval`. Reemplazar con SSE:
   ```js
   const es = new EventSource('/api/donations/live');
   es.onmessage = (e) => { const d = JSON.parse(e.data); /* actualizar UI */ };
   ```

2. **Botones de donación** — al clickear Mercado Pago o PayPal, hacer POST al backend y redirigir al init_point.

3. **Consolidado financiero** — hacer GET /api/summary al cargar la página y reemplazar los valores hardcodeados.

4. **Tipo de cambio** — hacer GET /api/exchange-rate y mostrar valor actualizado.

5. **Galería de transparencia** — hacer GET /api/transparency y renderizar las tarjetas.

### Paso 5 — Variables de entorno
Creá `.env.example` con todas las variables necesarias (ver README.md).

### Paso 6 — Deploy
Configurá `railway.json` o `render.yaml` para deploy con un click.

## Contexto importante
- El operativo trabaja con **pesos argentinos (ARS)** y **USDT**. Todo se consolida en **USD** como moneda base.
- La tasa de cambio a usar es **BNA venta** (Banco Nación Argentina).
- Los donativos en ARS se convierten a USD al momento de registrarlos: `amount_usd = amount_ars / bna_venta`.
- Los USDT entran directo como USD (1 USDT = 1 USD).
- El **100% de los fondos** va a insumos médicos. No hay fee de plataforma propio.
- El comité externo de fiscalización necesita acceso de solo lectura a la tabla `donations` y `expenses`.

## Empezá por
1. Leer el README.md
2. Crear la estructura de carpetas
3. Implementar el schema de Supabase
4. Implementar los endpoints en este orden: summary → exchange-rate → donations/mp → live SSE

Avisame antes de escribir código si tenés preguntas sobre el flujo de negocio.
