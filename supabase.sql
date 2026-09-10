-- Chat Agendamento — schema Supabase
-- Como usar: Supabase Dashboard > SQL Editor > cole tudo e clique em Run
-- Seg-Sáb 09:00–19:30, Domingo fechado (regra aplicada no frontend)

-- 1. Tabelas
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  price numeric(10,2) not null,
  duration_min int not null default 30,
  active boolean not null default true
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  total numeric(10,2) not null default 0,
  status text not null default 'confirmado',
  created_at timestamptz not null default now(),
  constraint chk_dates check (ends_at > starts_at)
);

create table if not exists appointment_services (
  appointment_id uuid not null references appointments(id) on delete cascade,
  service_id uuid not null references services(id),
  price_at_booking numeric(10,2) not null,
  primary key (appointment_id, service_id)
);

create index if not exists idx_appointments_starts on appointments(starts_at);
create index if not exists idx_appointments_status on appointments(status);

-- 2. Seed: barba 20, cabelo 30, sobrancelha 10
insert into services (name, price, duration_min) values
  ('Corte de cabelo', 30, 40),
  ('Barba', 20, 30),
  ('Sobrancelha', 10, 20)
on conflict (name) do update set
  price = excluded.price,
  duration_min = excluded.duration_min,
  active = true;

-- 3. RLS (MVP: leitura de serviços/horários + inserção de agendamento via anon key)
alter table services enable row level security;
alter table appointments enable row level security;
alter table appointment_services enable row level security;

drop policy if exists "services_read" on services;
create policy "services_read" on services
  for select to anon, authenticated using (active = true);

drop policy if exists "appointments_read" on appointments;
create policy "appointments_read" on appointments
  for select to anon, authenticated using (true);

drop policy if exists "appointments_insert" on appointments;
create policy "appointments_insert" on appointments
  for insert to anon, authenticated with check (true);

drop policy if exists "appt_services_read" on appointment_services;
create policy "appt_services_read" on appointment_services
  for select to anon, authenticated using (true);

drop policy if exists "appt_services_insert" on appointment_services;
create policy "appt_services_insert" on appointment_services
  for insert to anon, authenticated with check (true);
