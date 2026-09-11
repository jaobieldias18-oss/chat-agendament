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

-- 5. Grade fixa de horários (30 em 30 min) + agendamentos em português
create table if not exists horarios (
  id uuid primary key default gen_random_uuid(),
  dia date not null,
  horario time not null,
  disponivel boolean not null default true,
  created_at timestamptz not null default now(),
  unique (dia, horario)
);

create table if not exists agendamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  horario_id uuid not null references horarios(id) on delete restrict,
  servicos text not null default '',
  total numeric(10,2) not null default 0,
  status text not null default 'confirmado',
  created_at timestamptz not null default now()
);

create index if not exists idx_horarios_dia on horarios(dia);
create index if not exists idx_horarios_disp on horarios(disponivel);

-- Seed: próximos 14 dias (exceto domingo), 09:00–19:00 de 30 em 30 min
insert into horarios (dia, horario)
select d::date, (time '09:00' + (m || ' minutes')::interval)::time
from generate_series(current_date, current_date + 13, '1 day'::interval) d,
     generate_series(0, 600, 30) m
where extract(isodow from d::date) <> 7
on conflict (dia, horario) do nothing;

-- Ao agendar, o horário fica indisponível; ao cancelar/excluir, volta a ficar livre
create or replace function public.sync_horario_disp()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update horarios set disponivel = false where id = NEW.horario_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update horarios set disponivel = true where id = OLD.horario_id;
    return OLD;
  elsif TG_OP = 'UPDATE' and NEW.status = 'cancelado' and OLD.status <> 'cancelado' then
    update horarios set disponivel = true where id = NEW.horario_id;
    return NEW;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_agend_insert on agendamentos;
create trigger trg_agend_insert after insert on agendamentos
  for each row execute function public.sync_horario_disp();

drop trigger if exists trg_agend_delete on agendamentos;
create trigger trg_agend_delete after delete on agendamentos
  for each row execute function public.sync_horario_disp();

drop trigger if exists trg_agend_cancel on agendamentos;
create trigger trg_agend_cancel after update on agendamentos
  for each row execute function public.sync_horario_disp();

-- RLS
alter table horarios enable row level security;
alter table agendamentos enable row level security;

drop policy if exists "horarios_read" on horarios;
create policy "horarios_read" on horarios
  for select to anon, authenticated using (true);

drop policy if exists "agendamentos_insert" on agendamentos;
create policy "agendamentos_insert" on agendamentos
  for insert to anon, authenticated with check (true);

drop policy if exists "agendamentos_read" on agendamentos;
create policy "agendamentos_read" on agendamentos
  for select to anon, authenticated using (true);
