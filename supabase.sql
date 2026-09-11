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
  ('Corte de cabelo', 30, 30),
  ('Barba', 20, 15),
  ('Sobrancelha', 10, 5)
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

-- 4. Horários livres calculados NO BANCO
-- Uso: POST /rest/v1/rpc/free_slots { "p_day": "2026-09-12", "p_duration_min": 45 }
-- Retorna os inícios livres (HH:MM). Domingo = nenhum. Passado = excluído.
create or replace function public.free_slots(p_day date, p_duration_min int default 30)
returns table (slot text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_need int := (ceil(p_duration_min / 30.0) * 30)::int; -- ex: 45min ocupa 60min
  v_open int := 9 * 60;          -- 9h em minutos
  v_close_min int := 19 * 60 + 30; -- 19h30
  v_close timestamptz := (p_day::timestamp + time '19:30') at time zone 'America/Sao_Paulo';
  m int;
  v_start timestamptz;
  v_end timestamptz;
begin
  if extract(isodow from p_day) = 7 then return; end if; -- domingo fechado
  m := v_open;
  while m + 30 <= v_close_min loop
    v_start := (p_day::timestamp + make_time(m / 60, m % 60, 0)) at time zone 'America/Sao_Paulo';
    v_end := v_start + (v_need || ' minutes')::interval;
    if v_end <= v_close
       and v_start > now()
       and not exists (
         select 1 from appointments a
         where a.status <> 'cancelado'
           and v_start < a.ends_at
           and v_end > a.starts_at
       )
    then
      slot := to_char(v_start at time zone 'America/Sao_Paulo', 'HH24:MI');
      return next;
    end if;
    m := m + 30;
  end loop;
end;
$$;

grant execute on function public.free_slots(date, int) to anon, authenticated;
