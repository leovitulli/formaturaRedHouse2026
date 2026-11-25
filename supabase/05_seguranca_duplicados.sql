-- Segurança contra cadastros duplicados e comprovantes repetidos.
-- Rode uma vez no SQL Editor do Supabase.

-- 1. Normalização de texto (sem acentos, minúsculas, espaços simples)
create or replace function norm_txt(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    translate(lower(coalesce(t, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'))
$$;

-- 2. Verifica se já existe cadastro para o mesmo formando / responsável / CPF
create or replace function verificar_cadastro_duplicado(p_formando text, p_cpf text, p_resp1 text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  fn text := norm_txt(p_formando);
  p1 text := split_part(fn, ' ', 1);
  rn text := norm_txt(p_resp1);
  cpf_limpo text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
begin
  if fn <> '' and exists (select 1 from familias where norm_txt(formando_nome) = fn) then
    return 'Já existe um cadastro para este formando. Se você já assinou, clique em "Entrar" com o e-mail usado no cadastro.';
  end if;

  if cpf_limpo <> '' and p1 <> '' and exists (
    select 1 from familias
    where regexp_replace(resp1_cpf, '\D', '', 'g') = cpf_limpo
      and split_part(norm_txt(formando_nome), ' ', 1) = p1
  ) then
    return 'Já existe um cadastro com este CPF para este formando. Se você já assinou, use "Entrar".';
  end if;

  if rn <> '' and p1 <> '' and exists (
    select 1 from familias
    where (norm_txt(resp1_nome) = rn or norm_txt(resp2_nome) = rn)
      and split_part(norm_txt(formando_nome), ' ', 1) = p1
  ) then
    return 'Já existe um cadastro com este responsável para este formando. Se você já assinou, use "Entrar".';
  end if;

  return null;
end $$;

grant execute on function verificar_cadastro_duplicado(text, text, text) to anon, authenticated;

-- 3. Bloqueia também direto no trigger antes de inserir na tabela familias
create or replace function familias_antes_inserir() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare dup text;
begin
  dup := verificar_cadastro_duplicado(new.formando_nome, new.resp1_cpf, new.resp1_nome);
  if dup is not null then
    raise exception '%', dup using errcode = 'P0001';
  end if;
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

-- 4. Guarda o hash e o nome do pagador no comprovante (sem bloquear o envio, para o admin comparar visualmente)
alter table pagamentos add column if not exists comprovante_hash text;
alter table pagamentos add column if not exists pagador_nome text;

drop index if exists idx_pagamentos_hash_unico;

-- 5. Unifica dois cadastros duplicados (preserva rostos, fotos e comprovante sem duplicar contagem)
create or replace function unificar_familias(p_principal uuid, p_duplicado uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  dup_email text;
  dup_selfie text;
begin
  if not is_admin() then
    raise exception 'Acesso negado';
  end if;
  if p_principal = p_duplicado then
    raise exception 'Escolha cadastros diferentes';
  end if;

  select email, selfie_path into dup_email, dup_selfie from familias where id = p_duplicado;
  if dup_email is null then
    raise exception 'Cadastro duplicado não encontrado';
  end if;

  -- Move rostos e fotos para o principal
  update rostos set familia_id = p_principal where familia_id = p_duplicado;
  update fotos set familia_id = p_principal
    where familia_id = p_duplicado
      and not exists (select 1 from fotos f2 where f2.familia_id = p_principal and f2.path = fotos.path);

  -- Move comprovante do duplicado apenas para parcelas que o principal ainda não tem pagamento ativo
  update pagamentos p set familia_id = p_principal
    where p.familia_id = p_duplicado
      and p.status <> 'recusado'
      and not exists (
        select 1 from pagamentos p2
        where p2.familia_id = p_principal and p2.parcela = p.parcela and p2.status <> 'recusado'
      );

  update familias set
    aceite_biometria = aceite_biometria or exists (select 1 from rostos where familia_id = p_principal),
    selfie_path = coalesce(selfie_path, dup_selfie)
    where id = p_principal;

  perform registrar(p_principal, 'Cadastros unificados', jsonb_build_object('duplicado_id', p_duplicado, 'duplicado_email', dup_email));

  delete from familias where id = p_duplicado;
end $$;

grant execute on function unificar_familias(uuid, uuid) to authenticated;
