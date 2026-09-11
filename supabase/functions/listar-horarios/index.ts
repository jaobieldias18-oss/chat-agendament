// supabase/functions/listar-horarios/index.ts
// Lista horários livres da tabela `horarios` em JSON.
// Uso: GET /functions/v1/listar-horarios           -> todos os disponíveis
//      GET /functions/v1/listar-horarios?dia=2026-09-12 -> só do dia

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const base = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!base || !key) {
      return Response.json({ error: 'Variáveis do projeto indisponíveis.' }, { status: 500, headers: cors });
    }

    const dia = new URL(req.url).searchParams.get('dia');
    let path =
      '/rest/v1/horarios?select=id,dia,horario,disponivel' +
      '&disponivel=eq.true&order=dia.asc,horario.asc';
    if (dia) path += `&dia=eq.${dia}`;

    const r = await fetch(base + path, {
      headers: { apikey: key, Authorization: 'Bearer ' + key }
    });
    if (!r.ok) {
      return Response.json({ error: 'Banco erro ' + r.status }, { status: 502, headers: cors });
    }

    const horarios = await r.json();
    return Response.json({ horarios }, { headers: cors });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: cors });
  }
});
