# O Orçamento na Hora — Pintor autônomo

Assistente virtual que calcula orçamentos de pintura na hora e salva o contato do cliente no Supabase.

## Links

- 🌐 Site: https://jaobieldias18-oss.github.io/or-amento/
- 🔧 Painel do pintor: https://jaobieldias18-oss.github.io/or-amento/admin.html
- 💻 Repositório: https://github.com/jaobieldias18-oss/or-amento

## Preços (valores exatos do cliente)

| Tipo | R$/cômodo |
|---|---|
| Parede lisa | 120,00 |
| Parede com textura | 180,00 |
| Teto | 100,00 |

Extra: taxa de visita R$ 30,00 somente se o local for muito longe.

## Stack

- **Backend:** Supabase (tabelas `precos` + `orcamentos`, Edge Function `chat`)
- **IA:** Groq (`openai/gpt-oss-20b`, decide quando calcular/salvar, nunca inventa dado)
- **Frontend:** HTML, CSS e JavaScript puro (responsivo celular + PC)
- **Deploy:** GitHub Pages (atividade sugere Cloudflare Pages)

## Estrutura

- `index.html` — chat do cliente (mostra valor calculado + confirmação)
- `admin.html` — painel do pintor (pedidos, total, ligar/WhatsApp)
- `style.css` — estilos + responsivo
- `script.js` — fluxo nome → telefone → serviço → qtd → longe? → orçamento → save
- `supabase.sql` — schema + seed + RLS
- `supabase/functions/chat/index.ts` — tools `calcular_orcamento` + `salvar_lead`

## Como rodar

Abra o `index.html` no navegador (Live Server) ou acesse o link do site acima.
