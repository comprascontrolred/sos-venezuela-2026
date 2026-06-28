-- ══════════════════════════════════════════════
-- SOS Venezuela — Supabase Schema
-- Ejecutar en SQL Editor de Supabase
-- ══════════════════════════════════════════════

-- Donaciones
create table if not exists donations (
  id          uuid primary key default gen_random_uuid(),
  donor_name  text not null default 'Anónimo',
  amount_usd  numeric(12,2) not null,
  amount_original numeric(12,2) not null,
  currency    text not null check (currency in ('ARS','USD','USDT','EUR')),
  method      text not null check (method in ('mercadopago','paypal','transfer','crypto')),
  country     text not null default 'AR',
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  receipt_url text,
  created_at  timestamptz not null default now()
);

-- Gastos
create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  description text not null,
  amount_usd  numeric(12,2) not null,
  category    text not null check (category in ('medical','logistics','food','shelter','other')),
  receipt_url text,
  created_at  timestamptz not null default now()
);

-- Transparencia (facturas + fotos de entrega)
create table if not exists transparency_items (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('factura','entrega')),
  title       text not null,
  description text,
  image_url   text,
  doc_url     text,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

-- Tipo de cambio
create table if not exists exchange_rates (
  id         uuid primary key default gen_random_uuid(),
  usd_ars    numeric(10,2) not null,
  source     text not null,
  fetched_at timestamptz not null default now()
);

-- ── Índices ──
create index if not exists idx_donations_status on donations(status);
create index if not exists idx_donations_created on donations(created_at desc);
create index if not exists idx_transparency_type on transparency_items(type);
create index if not exists idx_exchange_rates_fetched on exchange_rates(fetched_at desc);

-- ── RLS (Row Level Security) ──
alter table donations enable row level security;
alter table expenses enable row level security;
alter table transparency_items enable row level security;
alter table exchange_rates enable row level security;

-- Lectura pública para transparencia
create policy "Public read donations" on donations for select using (true);
create policy "Public read expenses" on expenses for select using (true);
create policy "Public read transparency" on transparency_items for select using (true);
create policy "Public read rates" on exchange_rates for select using (true);

-- Solo service_role puede insertar/actualizar
create policy "Service insert donations" on donations for insert with check (true);
create policy "Service insert expenses" on expenses for insert with check (true);
create policy "Service insert transparency" on transparency_items for insert with check (true);
create policy "Service insert rates" on exchange_rates for insert with check (true);

-- ── Storage bucket ──
-- Crear manualmente en Supabase Dashboard:
-- Bucket: "comprobantes", público, max 10MB, tipos: image/jpeg, image/png, image/webp, application/pdf
