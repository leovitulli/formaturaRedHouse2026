-- Ativa atualização instantânea (Realtime) no painel /admin.
-- Rode uma vez no SQL Editor do Supabase.

do $$
declare t text;
begin
  foreach t in array array['familias', 'pagamentos', 'fotos', 'rostos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

