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
    const { message, history = [] } = await req.json();

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
        max_tokens: 150, // resposta curta
        messages: [
          {
            role: 'system',
            content:
              'Você é o atendente de uma barbearia. Responda curto e direto como no WhatsApp (máx 2 frases). ' +
              'Serviços: Corte de cabelo R$30, Barba R$20, Sobrancelha R$10. Horário: Seg–Sáb 9h–19h30. ' +
              'Se o cliente quiser agendar, peça: nome, telefone, serviços, data e horário.'
          },
          ...history,
          { role: 'user', content: message }
        ]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return Response.json({ error: 'Groq erro ' + r.status, detail: t }, { status: 502, headers: cors });
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content ?? 'Pode me dizer o que você precisa?';
    return Response.json({ reply }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
