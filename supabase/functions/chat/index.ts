// supabase/functions/chat/index.ts
// ATIVIDADE O ORÇAMENTO NA HORA — Pintor autônomo
// A IA decide sozinha quando CALCULAR e quando SALVAR. Nunca inventa dado.
// Segredos SÓ no servidor: GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Nunca exponha SB_SECRET nem GSK no frontend.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SYSTEM = `Você é o assistente virtual de um pintor autônomo. Fale curto como WhatsApp (máx 2 frases).

PREÇOS FIXOS por cômodo (NUNCA mude, nunca arredonde diferente):
- parede_lisa: Parede lisa = R$ 120.00
- parede_textura: Parede com textura = R$ 180.00
- teto: Teto = R$ 100.00
Cálculo: total = preço * quantidade_comodos (+ R$ 30 de taxa de visita SOMENTE se visita_longa=true).
TAXA: pergunte "o local é muito longe?" Se sim, some R$ 30 e avise. Se não, sem taxa.

REGRAS DURAS:
1. Para CALCULAR precisa ter tipo_servico + quantidade_comodos. Se faltar um, PERGUNTE. Nunca invente.
2. Para SALVAR precisa ter nome + telefone + tipo_servico + quantidade_comodos + valor_calculado. Se faltar, PERGUNTE.
3. Quando o usuário informar tipo e quantidade, chame calcular_orcamento.
4. Quando tiver os 5 dados + usuário confirmou ("pode salvar", "confirma", "sim"), chame salvar_lead.
5. Telefone precisa ter 8-15 dígitos. Quantidade precisa ser inteiro > 0.
6. Sempre mostre o valor calculado como R$ XXX,XX e confirme "lead salvo" após salvar.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'calcular_orcamento',
      description: 'Calcula orçamento. Chame quando tiver tipo_servico e quantidade_comodos. Pergunte se é longe para a taxa.',
      parameters: {
        type: 'object',
        properties: {
          tipo_servico: { type: 'string', enum: ['parede_lisa', 'parede_textura', 'teto'] },
          quantidade_comodos: { type: 'integer', minimum: 1 },
          visita_longa: { type: 'boolean', description: 'true se o local é muito longe (soma R$30), false se perto' }
        },
        required: ['tipo_servico', 'quantidade_comodos']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'salvar_lead',
      description: 'Salva o orçamento como lead. Chame só com os 5 dados + confirmação do usuário.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          telefone: { type: 'string' },
          tipo_servico: { type: 'string', enum: ['parede_lisa', 'parede_textura', 'teto'] },
          quantidade_comodos: { type: 'integer', minimum: 1 },
          valor_calculado: { type: 'number' }
        },
        required: ['nome', 'telefone', 'tipo_servico', 'quantidade_comodos', 'valor_calculado']
      }
    }
  }
];

function normTipo(t: string): string | null {
  const s = (t ?? '').toLowerCase();
  if (s.includes('lisa')) return 'parede_lisa';
  if (s.includes('textura')) return 'parede_textura';
  if (s.includes('teto')) return 'teto';
  if (['parede_lisa', 'parede_textura', 'teto'].includes(s)) return s;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const GROQ = Deno.env.get('GROQ_API_KEY') ?? '';
    const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!GROQ) return Response.json({ error: 'GROQ_API_KEY não configurada. Rode: supabase secrets set GROQ_API_KEY=...' }, { status: 500, headers: cors });
    if (!SB_URL || !SB_SVC) return Response.json({ error: 'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nos secrets.' }, { status: 500, headers: cors });

    const { message = '', history = [] } = await req.json();

    async function groq(messages: unknown[]) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          temperature: 0.2,
          max_tokens: 400,
          messages,
          tools: TOOLS,
          tool_choice: 'auto'
        })
      });
      if (!r.ok) throw new Error('Groq erro ' + r.status + ': ' + (await r.text()).slice(0, 300));
      return await r.json();
    }

    async function buscarPreco(tipo: string): Promise<number> {
      const r = await fetch(`${SB_URL}/rest/v1/precos?select=preco_por_comodo&tipo=eq.${tipo}&limit=1`, {
        headers: { apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC }
      });
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) return Number(rows[0].preco_por_comodo);
      const fb: Record<string, number> = { parede_lisa: 120, parede_textura: 180, teto: 100 };
      return fb[tipo] ?? 0;
    }

    // 1ª chamada: IA decide o que fazer
    const data = await groq([{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: message }]);
    const msg = data.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];

    // Sem tool-call = só conversa (pergunta o que falta)
    if (!calls.length) {
      return Response.json({ reply: msg?.content ?? 'Me diz o tipo de serviço e a quantidade de cômodos?', valor_calculado: null, lead_salvo: false }, { headers: cors });
    }

    // Executa tools
    const toolResults: unknown[] = [];
    let valor_calculado: number | null = null;
    let lead_salvo = false;

    for (const c of calls) {
      const name = c.function?.name;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(c.function?.arguments ?? '{}'); } catch { /* mantém vazio */ }

      if (name === 'calcular_orcamento') {
        const tipo = normTipo(String(args.tipo_servico ?? ''));
        const qtd = Number(args.quantidade_comodos);
        const visita = args.visita_longa === true;
        if (!tipo || !Number.isInteger(qtd) || qtd < 1) {
          toolResults.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ ok: false, error: 'Faltam tipo ou quantidade válida. Pergunte.' }) });
          continue;
        }
        const preco = await buscarPreco(tipo);
        const taxa = visita ? 30 : 0;
        valor_calculado = preco * qtd + taxa;
        toolResults.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ ok: true, tipo_servico: tipo, quantidade_comodos: qtd, preco_por_comodo: preco, taxa_visita: taxa, valor_calculado }) });
      }

      if (name === 'salvar_lead') {
        const nome = String(args.nome ?? '').trim();
        const telefone = String(args.telefone ?? '').trim();
        const tipo = normTipo(String(args.tipo_servico ?? ''));
        const qtd = Number(args.quantidade_comodos);
        const valor = Number(args.valor_calculado);
        const foneOk = telefone.replace(/\D/g, '').length >= 8 && telefone.replace(/\D/g, '').length <= 15;
        if (!nome || !foneOk || !tipo || !Number.isInteger(qtd) || qtd < 1 || !(valor > 0)) {
          toolResults.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ ok: false, error: 'Dados incompletos. Pergunte o que falta, não invente.' }) });
          continue;
        }
        const ins = await fetch(`${SB_URL}/rest/v1/orcamentos`, {
          method: 'POST',
          headers: { apikey: SB_SVC, Authorization: 'Bearer ' + SB_SVC, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify([{ nome, telefone, tipo_servico: tipo, quantidade_comodos: qtd, valor_calculado: valor }])
        });
        if (!ins.ok) {
          toolResults.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ ok: false, error: 'Falha ao salvar lead.' }) });
          continue;
        }
        lead_salvo = true;
        valor_calculado = valor;
        toolResults.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify({ ok: true, lead_salvo: true }) });
      }
    }

    // 2ª chamada: IA gera resposta final com o resultado do banco
    const data2 = await groq([
      { role: 'system', content: SYSTEM + '\nMostre o valor como R$ com vírgula. Se salvou, diga "lead salvo, o pintor vai te ligar".' },
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: msg?.content ?? null, tool_calls: calls },
      ...toolResults
    ]);
    const reply = data2.choices?.[0]?.message?.content ?? 'Pronto!';
    return Response.json({ reply, valor_calculado, lead_salvo }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
