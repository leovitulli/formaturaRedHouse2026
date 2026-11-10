# Formatura Red House · sistema de aceite, pagamento e fotos

## O que o sistema faz

| Tela | Quem usa | Função |
|---|---|---|
| `/` | Pais | Proposta completa e valor por formando |
| `/cadastro` | Pais | Nome completo do formando e dos responsáveis, CPF, contato, forma de pagamento, autorizações (aceite, reconhecimento facial, portfólio) e foto do rosto do formando |
| `/minha-area` | Pais | QR Code Pix com o valor exato, envio do comprovante, status de cada parcela e galeria de fotos (liberada só após pagamento total confirmado) |
| `/admin` | Você | Resumo financeiro (contratado, recebido, custos, lucro), lista de famílias, conferência de comprovantes, envio manual de fotos, configuração de preço e chave Pix |
| `scripts/reconhecer.py` | Você, no Mac | Separa as fotos do evento por formando com reconhecimento facial e publica na galeria de cada família |

Custo: zero (Supabase e Vercel no plano gratuito; reconhecimento roda no seu Mac).

## 1. Banco de dados (Supabase, ~10 min)

1. Crie uma conta em supabase.com e um projeto novo (região São Paulo).
2. **SQL Editor > New query**: cole todo o `supabase/schema.sql` e clique em **Run**.
   - O arquivo já vem com preço R$630, sua chave Pix, custo fixo R$3.200 e álbum R$180. Dá para mudar depois no painel.
3. **Authentication > Providers > Email**: desligue **Confirm email** (assim o pai cadastra e já paga, sem precisar confirmar e-mail).
4. **Authentication > Users > Add user**: crie o seu login de administrador. Copie o UID e rode no SQL Editor:
   ```sql
   insert into admins values ('COLE-O-UID-AQUI');
   ```
5. **Project Settings > API**: copie a `Project URL`, a chave `anon` e a `service_role` (essa última só para o script, nunca no site).
6. **Storage > Settings**: aumente o limite de arquivo para 20 MB (fotos tratadas em alta).

## 2. Site (Vercel, ~5 min)

1. Suba esta pasta num repositório GitHub.
2. Em vercel.com: **Add New > Project**, escolha o repositório.
3. Em **Environment Variables** adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. Envie o link para a Fernanda repassar aos pais.

Para testar no Mac antes: copie `.env.example` para `.env.local`, preencha e rode `npm install && npm run dev`.

## 3. Pagamentos

- O pai paga pelo QR Code (o valor e o favorecido já vêm preenchidos) e envia o comprovante.
- No painel, abra **Detalhes**, clique em **Ver**, confira no extrato do banco e clique em **Confirmar**.
- Quando o total está confirmado, a família vê as fotos.

## 4. Fotos depois do evento (no seu Mac)

```bash
cd scripts
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # preencha SUPABASE_URL e SUPABASE_SERVICE_KEY
```

Separe as fotos tratadas em duas pastas:

- **Fotos com pessoas identificáveis** (apresentação, família, individuais):
  ```bash
  python3 reconhecer.py ~/Formatura/fotos --enviar
  ```
  Cada rosto é comparado com a foto de referência dos formandos. Uma foto com 5 formandos vai para os 5. Também cria pastas por formando em `_separadas/` no seu Mac, prontas para montar os álbuns. Sem `--enviar`, só separa no Mac para você revisar antes.
- **Fotos coletivas** (turma toda, palco aberto):
  ```bash
  python3 reconhecer.py ~/Formatura/turma --turma
  ```
  Vão para a galeria de todas as famílias.

Fotos sem nenhum formando reconhecido ficam em `_separadas/_sem_formando` para você decidir. Famílias que não autorizaram o reconhecimento aparecem no aviso inicial: envie as fotos delas manualmente pelo painel.

Se aparecer foto de outra criança, aumente `LIMIAR` no início do script (ex.: 0.5). Se faltar foto, diminua (ex.: 0.35). Primeira execução baixa o modelo (~300 MB).

## 5. LGPD (obrigatório)

Após a entrega, apague as fotos de referência dos rostos:
```bash
python3 reconhecer.py --apagar-selfies
```
O termo de aceite promete isso aos pais.

## Antes de divulgar o link

- Confirme a **gramatura do álbum** (a proposta em PDF tinha 300g e 350g) e o **número de lâminas**, e ajuste o texto em `app/page.js`.
- A equipe na página é 1 fotógrafo + 3 filmmakers (sem assistente).
