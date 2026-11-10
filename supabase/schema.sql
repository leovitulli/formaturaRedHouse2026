-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > colar > Run

-- Configuração do evento (uma linha só)
create table config (
  id int primary key default 1 check (id = 1),
  preco numeric not null default 630,
  pix_chave text not null default 'SUA-CHAVE-PIX',
  pix_nome text not null default 'SEU NOME',
  pix_cidade text not null default 'Sao Paulo',
  custo_fixo numeric not null default 3200,
  custo_album numeric not null default 180
);
insert into config default values;

create table admins (user_id uuid primary key references auth.users on delete cascade);

create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from admins where user_id = auth.uid())
$$;

-- Uma família por login
create table familias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null default auth.uid() references auth.users on delete cascade,
  formando_nome text not null,
  resp1_nome text not null,
  resp1_cpf text not null,
  resp1_parentesco text not null,
  resp2_nome text,
  resp2_parentesco text,
  email text not null,
  telefone text not null,
  forma_pagamento text not null check (forma_pagamento in ('avista','2x')),
  valor numeric not null default 0,
  aceite_proposta boolean not null check (aceite_proposta),
  aceite_biometria boolean not null default false,
  aceite_portfolio boolean not null default false,
  aceite_em timestamptz not null default now(),
  aceite_navegador text,
  selfie_path text,
  criado_em timestamptz not null default now()
);

-- Valor e data do aceite são definidos pelo servidor, não pelo navegador
create or replace function familias_antes_inserir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.valor := (select preco from config where id = 1);
  new.aceite_em := now();
  new.user_id := auth.uid();
  return new;
end $$;
create trigger t_familias before insert on familias for each row execute function familias_antes_inserir();

create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  parcela int not null check (parcela in (1,2)),
  valor numeric not null,
  comprovante_path text not null,
  status text not null default 'enviado' check (status in ('enviado','confirmado','recusado')),
  criado_em timestamptz not null default now(),
  revisado_em timestamptz
);

create table fotos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  path text not null unique,
  criado_em timestamptz not null default now()
);

create or replace function minha_familia() returns uuid
language sql security definer stable set search_path = public as $$
  select id from familias where user_id = auth.uid()
$$;

-- Fotos só liberam quando o valor total estiver confirmado
create or replace function quitada(fid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select sum(valor) from pagamentos where familia_id = fid and status = 'confirmado'), 0)
         >= (select valor from familias where id = fid)
$$;

-- Segurança por linha
alter table config enable row level security;
alter table admins enable row level security;
alter table familias enable row level security;
alter table pagamentos enable row level security;
alter table fotos enable row level security;

create policy "config leitura" on config for select using (true);
create policy "config admin" on config for update using (is_admin());

create policy "admin vê a si" on admins for select using (user_id = auth.uid());

create policy "familia lê" on familias for select using (user_id = auth.uid() or is_admin());
create policy "familia cria" on familias for insert with check (auth.uid() is not null);
create policy "admin altera familia" on familias for update using (is_admin());
create policy "admin apaga familia" on familias for delete using (is_admin());

create policy "pag lê" on pagamentos for select using (familia_id = minha_familia() or is_admin());
create policy "pag envia" on pagamentos for insert with check (familia_id = minha_familia() and status = 'enviado');
create policy "pag admin" on pagamentos for update using (is_admin());
create policy "pag apaga" on pagamentos for delete using (is_admin());

create policy "fotos lê" on fotos for select using (is_admin() or (familia_id = minha_familia() and quitada(familia_id)));
create policy "fotos admin" on fotos for all using (is_admin()) with check (is_admin());

-- Armazenamento (todos privados)
insert into storage.buckets (id, name, public) values
  ('selfies','selfies',false), ('comprovantes','comprovantes',false), ('fotos','fotos',false);

create policy "selfie envia" on storage.objects for insert
  with check (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "selfie troca" on storage.objects for update
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "selfie lê" on storage.objects for select
  using (bucket_id = 'selfies' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

create policy "comprovante envia" on storage.objects for insert
  with check (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "comprovante lê" on storage.objects for select
  using (bucket_id = 'comprovantes' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

create policy "foto lê" on storage.objects for select
  using (bucket_id = 'fotos' and (is_admin() or (
    (storage.foldername(name))[1] = minha_familia()::text and quitada(minha_familia()))));
create policy "foto admin envia" on storage.objects for insert with check (bucket_id = 'fotos' and is_admin());
create policy "foto admin apaga" on storage.objects for delete using (bucket_id in ('fotos','selfies','comprovantes') and is_admin());
