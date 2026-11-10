-- Prova do aceite e trilha de auditoria. Rode uma vez no SQL Editor do Supabase.
create extension if not exists pgcrypto with schema extensions;

-- 1. Novos campos de prova no aceite
alter table familias add column if not exists aceite_texto text;
alter table familias add column if not exists aceite_versao text;
alter table familias add column if not exists aceite_hash text;
alter table familias add column if not exists aceite_ip text;

-- Dados da requisição, lidos do servidor (o navegador não consegue falsificar)
create or replace function req_header(nome text) returns text
language sql stable as $$
  select coalesce(current_setting('request.headers', true), '{}')::json ->> nome
$$;
create or replace function req_ip() returns text
language sql stable as $$
  select coalesce(req_header('cf-connecting-ip'), split_part(req_header('x-forwarded-for'), ',', 1), req_header('x-real-ip'))
$$;

create or replace function familias_antes_inserir() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  new.valor := (select preco from config where id = 1);
  new.aceite_em := now();
  new.user_id := auth.uid();
  new.aceite_ip := req_ip();
  new.aceite_navegador := coalesce(req_header('user-agent'), new.aceite_navegador);
  if new.aceite_texto is not null then
    new.aceite_hash := encode(digest(new.aceite_texto, 'sha256'), 'hex');
  end if;
  return new;
end $$;

-- 2. Log de auditoria (somente inclusão; ninguém edita nem apaga pelo sistema)
create table if not exists auditoria (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  familia_id uuid,
  autor uuid,
  autor_email text,
  evento text not null,
  detalhes jsonb,
  ip text,
  navegador text
);
alter table auditoria enable row level security;
create policy "auditoria admin lê" on auditoria for select using (is_admin());
-- sem políticas de insert/update/delete: só os gatilhos abaixo escrevem

create or replace function registrar(fid uuid, ev text, det jsonb) returns void
language sql security definer set search_path = public as $$
  insert into auditoria (familia_id, autor, autor_email, evento, detalhes, ip, navegador)
  values (fid, auth.uid(), (select email from auth.users where id = auth.uid()), ev, det, req_ip(), req_header('user-agent'))
$$;
revoke execute on function registrar(uuid, text, jsonb) from public, anon, authenticated;

create or replace function aud_familias() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform registrar(new.id, 'Proposta aceita (assinatura eletrônica)', jsonb_build_object(
      'formando', new.formando_nome, 'responsavel', new.resp1_nome, 'cpf', new.resp1_cpf,
      'parentesco', new.resp1_parentesco, 'segundo_responsavel', new.resp2_nome,
      'email', new.email, 'telefone', new.telefone, 'valor', new.valor, 'forma', new.forma_pagamento,
      'versao_proposta', new.aceite_versao, 'hash_sha256', new.aceite_hash,
      'autoriza_reconhecimento', new.aceite_biometria, 'autoriza_portfolio', new.aceite_portfolio));
  elsif tg_op = 'UPDATE' then
    perform registrar(new.id, 'Cadastro alterado', jsonb_build_object('antes', to_jsonb(old) - 'aceite_texto', 'depois', to_jsonb(new) - 'aceite_texto'));
  else
    perform registrar(old.id, 'Cadastro excluído', to_jsonb(old) - 'aceite_texto');
  end if;
  return null;
end $$;
drop trigger if exists t_aud_familias on familias;
create trigger t_aud_familias after insert or update or delete on familias for each row execute function aud_familias();

create or replace function aud_pagamentos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform registrar(new.familia_id, 'Comprovante enviado', jsonb_build_object('parcela', new.parcela, 'valor', new.valor, 'arquivo', new.comprovante_path));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform registrar(new.familia_id,
      case new.status when 'confirmado' then 'Pagamento confirmado' when 'recusado' then 'Novo comprovante pedido' else 'Status do pagamento alterado' end,
      jsonb_build_object('parcela', new.parcela, 'valor', new.valor, 'de', old.status, 'para', new.status, 'motivo', new.motivo));
  elsif tg_op = 'DELETE' then
    perform registrar(old.familia_id, 'Pagamento excluído', to_jsonb(old));
  end if;
  return null;
end $$;
drop trigger if exists t_aud_pagamentos on pagamentos;
create trigger t_aud_pagamentos after insert or update or delete on pagamentos for each row execute function aud_pagamentos();

create or replace function aud_rostos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform registrar(new.familia_id, 'Rosto de referência enviado com autorização', jsonb_build_object('tipo', new.tipo));
  else
    perform registrar(old.familia_id, 'Rosto de referência removido', jsonb_build_object('tipo', old.tipo));
  end if;
  return null;
end $$;
drop trigger if exists t_aud_rostos on rostos;
create trigger t_aud_rostos after insert or delete on rostos for each row execute function aud_rostos();

create or replace function aud_fotos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform registrar(new.familia_id, 'Foto publicada na galeria', jsonb_build_object('arquivo', new.path));
  return null;
end $$;
drop trigger if exists t_aud_fotos on fotos;
create trigger t_aud_fotos after insert on fotos for each row execute function aud_fotos();

-- Número de formandos da turma (meta de arrecadação)
alter table config add column if not exists total_formandos int not null default 16;
