// supabase/functions/chat/index.ts
// Atendente virtual — respostas curtas estilo WhatsApp.
// A GROQ_API_KEY fica SÓ como segredo da Edge Function, nunca no frontend.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // 1. Lê o segredo (configurado via: supabase secrets set GROQ_API_KEY=...)
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) {
      return Response.json(
        { error: 'GROQ_API_KEY não configurada. Rode: supabase secrets set GROQ_API_KEY=sua_chave' },
        { status: 500, headers: cors }
      );
    }

    // 2. Entrada vinda do frontend (sem chave nenhuma)
    // task: 'chat' (padrão) ou 'name_check' (diz se a mensagem contém um nome)
    const { message, history = [], task = 'chat' } = await req.json();

    async function groq(system: string, maxTokens: number) {
      // 3. Chama a API da Groq DO LADO DO SERVIDOR
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          temperature: 0.5,
          max_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: message }]
        })
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error('Groq erro ' + r.status + ': ' + t.slice(0, 300));
      }
      const data = await r.json();
      return (data.choices?.[0]?.message?.content ?? '') as string;
    }

    // Modo 1: verificar se a mensagem contém o NOME da pessoa
    if (task === 'name_check') {
      const raw = await groq(
        'Você identifica o NOME da pessoa numa mensagem de cliente de barbearia. ' +
        'Responda SOMENTE com um JSON, sem markdown: {"name": "<nome ou null>", "reply": "<resposta curta de WhatsApp em português>"}. ' +
        'Se a mensagem for só saudação ("oi", "olá, tudo bem?") sem nome, name=null e reply=saude de volta e pergunte o nome. ' +
        'Se contiver um nome ("sou o Carlos", "me chamo Ana", "João"), extraia só o nome em name e reply=cumprimente pelo nome e peça o telefone/WhatsApp. ' +
        'Nunca invente nomes.',
        150
      );
      const m = raw.match(/\{[\s\S]*\}/);
      let parsed: { name: string | null; reply: string };
      try {
        parsed = JSON.parse(m ? m[0] : raw);
      } catch {
        parsed = { name: null, reply: raw || 'Oi! Qual é o seu nome?' };
      }
      if (typeof parsed.name === 'string' && parsed.name.trim().toLowerCase() in { oi: 1, ola: 1, olá: 1, ei: 1, opa: 1 }) {
        parsed = { name: null, reply: 'Oi! Tudo bem? Qual é o seu nome?' };
      }
      return Response.json(parsed, { headers: cors });
    }

    // Modo 2: conversa normal, curta e direta estilo WhatsApp
    const reply = (await groq(
      'Você é o atendente de uma barbearia. Responda curto e direto como no WhatsApp (máx 2 frases). ' +
      'Serviços: Corte de cabelo R$30, Barba R$20, Sobrancelha R$10. Horário: Seg–Sáb 9h–19h30. ' +
      'Se o cliente quiser agendar, peça: nome, telefone, serviços, data e horário.',
      150 // resposta curta
    )) || 'Pode me dizer o que você precisa?';
    return Response.json({ reply }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
