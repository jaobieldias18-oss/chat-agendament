// supabase/functions/criar-agendamento/index.ts
// Reserva um horário: recebe horario_id + nome, verifica se está livre,
// cria o agendamento e marca o horário como indisponível (atômico).
// Uso: POST /functions/v1/criar-agendamento
// Body: { "horario_id": "uuid", "nome": "João", "telefone": "119...", "servicos": "Corte + Barba", "total": 50 }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const base = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!base || !key) {
      return Response.json({ error: 'Variáveis do projeto indisponíveis.' }, { status: 500, headers: cors });
    }
    const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

    const { horario_id, nome, telefone = '', servicos = '', total = 0 } = await req.json();
    if (!horario_id || !nome) {
      return Response.json(
        { ok: false, error: 'Informe horario_id e nome.' },
        { status: 400, headers: cors }
      );
    }

    // 1. O horário existe?
    const g = await fetch(
      `${base}/rest/v1/horarios?select=id,dia,horario,disponivel&id=eq.${horario_id}`,
      { headers: H }
    );
    if (!g.ok) return Response.json({ ok: false, error: 'Banco erro ' + g.status }, { status: 502, headers: cors });
    const rows = await g.json();
    if (!rows.length) {
      return Response.json({ ok: false, error: 'Horário não encontrado.' }, { status: 404, headers: cors });
    }
    if (!rows[0].disponivel) {
      return Response.json(
        { ok: false, error: 'Esse horário já está ocupado. Escolha outro.' },
        { status: 409, headers: cors }
      );
    }

    // 2. Reserva atômica: só marca false se ainda estiver true
    // (se dois clientes clicarem juntos, só um consegue)
    const u = await fetch(
      `${base}/rest/v1/horarios?id=eq.${horario_id}&disponivel=eq.true`,
      {
        method: 'PATCH',
        headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({ disponivel: false })
      }
    );
    const locked = await u.json();
    if (!u.ok || !locked.length) {
      return Response.json(
        { ok: false, error: 'Esse horário acabou de ser ocupado. Escolha outro.' },
        { status: 409, headers: cors }
      );
    }

    // 3. Cria o agendamento
    const ins = await fetch(`${base}/rest/v1/agendamentos`, {
      method: 'POST',
      headers: { ...H, Prefer: 'return=representation' },
      body: JSON.stringify([{ nome, telefone, horario_id, servicos, total }])
    });
    const created = await ins.json();
    if (!ins.ok) {
      // desfaz a reserva se falhar
      await fetch(`${base}/rest/v1/horarios?id=eq.${horario_id}`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({ disponivel: true })
      });
      return Response.json({ ok: false, error: 'Falha ao agendar.' }, { status: 502, headers: cors });
    }

    return Response.json(
      {
        ok: true,
        message: `Agendado! ${nome}, seu horário ${rows[0].dia} às ${String(rows[0].horario).slice(0, 5)} acabou de ser ocupado. Até lá!`,
        agendamento: created[0]
      },
      { headers: cors }
    );
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500, headers: cors });
  }
});
