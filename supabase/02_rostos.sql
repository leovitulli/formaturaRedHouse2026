-- Atualização: rostos de referência (formando e/ou responsáveis), enviados a qualquer momento.
-- Rode uma vez no SQL Editor do Supabase.

create table if not exists rostos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references familias on delete cascade,
  tipo text not null check (tipo in ('formando','mae','pai','responsavel')),
  path text not null,
  consentimento boolean not null check (consentimento),
  criado_em timestamptz not null default now()
);
alter table rostos enable row level security;

create policy "rostos lê" on rostos for select using (familia_id = minha_familia() or is_admin());
create policy "rostos envia" on rostos for insert with check (familia_id = minha_familia());
create policy "rostos apaga" on rostos for delete using (familia_id = minha_familia() or is_admin());

create policy "selfie apaga" on storage.objects for delete
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text);

-- Leva para a tabela nova as fotos enviadas no cadastro antigo
insert into rostos (familia_id, tipo, path, consentimento)
select id, 'formando', selfie_path, true from familias
where selfie_path is not null and aceite_biometria
  and not exists (select 1 from rostos r where r.path = familias.selfie_path);

-- Motivo do pedido de novo comprovante
alter table pagamentos add column if not exists motivo text;

-- Multa e juros por atraso (CDC art. 52 §1º: multa máx. 2%)
alter table config add column if not exists vencimento date not null default '2026-12-12';
alter table config add column if not exists multa_pct numeric not null default 2 check (multa_pct between 0 and 2);
alter table config add column if not exists juros_mes numeric not null default 1 check (juros_mes between 0 and 1);
