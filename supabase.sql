-- O ORÇAMENTO NA HORA — schema Supabase
-- Como usar: Supabase Dashboard > SQL Editor > cole tudo e clique em Run
-- Projeto: https://rfqpnkymkuubnalqcrqs.supabase.co
-- Preços exatos do cliente: parede lisa 120, parede com textura 180, teto 100

create table if not exists precos (
  id uuid primary key default gen_random_uuid(),
  tipo text unique not null,
  nome_exibicao text not null,
  preco_por_comodo numeric(10,2) not null,
  active boolean not null default true
);

create table if not exists orcamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  tipo_servico text not null,
  quantidade_comodos int not null check (quantidade_comodos > 0),
  valor_calculado numeric(10,2) not null,
  created_at timestamptz not null default now()
);

insert into precos (tipo, nome_exibicao, preco_por_comodo) values
  ('parede_lisa', 'Parede lisa', 120.00),
  ('parede_textura', 'Parede com textura', 180.00),
  ('teto', 'Teto', 100.00)
on conflict (tipo) do update set
  nome_exibicao = excluded.nome_exibicao,
  preco_por_comodo = excluded.preco_por_comodo,
  active = true;

alter table precos enable row level security;
alter table orcamentos enable row level security;

drop policy if exists "precos_read" on precos;
create policy "precos_read" on precos
  for select to anon, authenticated using (active = true);

drop policy if exists "orcamentos_insert" on orcamentos;
create policy "orcamentos_insert" on orcamentos
  for insert to anon, authenticated with check (true);

drop policy if exists "orcamentos_read" on orcamentos;
create policy "orcamentos_read" on orcamentos
  for select to anon, authenticated using (true);
