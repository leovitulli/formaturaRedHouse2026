-- Permite que o administrador anexe comprovantes diretamente pelo painel /admin.
-- Rode uma vez no SQL Editor do Supabase.

drop policy if exists "pag admin envia" on pagamentos;
create policy "pag admin envia" on pagamentos for insert
  with check (is_admin());

drop policy if exists "comprovante admin envia" on storage.objects;
create policy "comprovante admin envia" on storage.objects for insert
  with check (bucket_id = 'comprovantes' and is_admin());
