// Chat Agendamento — Supabase (HTML/CSS/JS puro)
const SUPABASE_URL = 'https://tzewnclsynnpjndadicm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n39L95mAzcq3MK4kiJ_Ocw_fDkqoYHT';

const messagesEl = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const panel = document.getElementById('panel');

const state = { step: 'name', name: '', phone: '', services: [], allServices: [], date: '', slot: null, total: 0, duration: 0 };
const OPEN_START = 9 * 60;      // 9h em minutos
const OPEN_END = 19 * 60 + 30;  // 19h30
const SLOT = 30;

function say(text, from = 'bot') {
  const d = document.createElement('div');
  d.className = from;
  d.textContent = text;
  messagesEl.appendChild(d);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function clearPanel() { panel.innerHTML = ''; }
function fmt(n) { return 'R$ ' + Number(n).toFixed(2).replace('.', ','); }

async function sb(path, opts = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {})
    }
  });
  if (!r.ok) throw new Error('Supabase erro ' + r.status);
  return r.json();
}

async function loadServices() {
  try {
    state.allServices = await sb('services?select=*&active=eq.true&order=name');
  } catch (e) {
    // fallback local se o SQL ainda não foi rodado
    state.allServices = [
      { id: 'cabelo', name: 'Corte de cabelo', price: 30, duration_min: 40 },
      { id: 'barba', name: 'Barba', price: 20, duration_min: 30 },
      { id: 'sobrancelha', name: 'Sobrancelha', price: 10, duration_min: 20 }
    ];
  }
}

function askServices() {
  state.step = 'services';
  say('Escolha os serviços (pode marcar mais de um):');
  clearPanel();
  state.allServices.forEach(s => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = `${s.name} — ${fmt(s.price)}`;
    b.onclick = () => b.classList.toggle('sel');
    b.dataset.id = s.id;
    panel.appendChild(b);
  });
  const ok = document.createElement('button');
  ok.className = 'primary';
  ok.textContent = 'Continuar';
  ok.onclick = () => {
    const sel = [...panel.querySelectorAll('.chip.sel')].map(c => c.dataset.id);
    if (!sel.length) { say('Marque pelo menos 1 serviço.'); return; }
    state.services = state.allServices.filter(s => sel.includes(String(s.id)));
    state.total = state.services.reduce((a, s) => a + Number(s.price), 0);
    state.duration = state.services.reduce((a, s) => a + (s.duration_min || 30), 0);
    const names = state.services.map(s => s.name).join(' + ');
    say(names, 'user');
    say(`Total: ${fmt(state.total)} (${state.duration} min).`);
    askDate();
  };
  panel.appendChild(ok);
}

function askDate() {
  state.step = 'date';
  say('Qual dia? (Seg–Sáb)');
  clearPanel();
  const inp = document.createElement('input');
  inp.type = 'date';
  inp.min = new Date().toISOString().slice(0, 10);
  const ok = document.createElement('button');
  ok.className = 'primary';
  ok.textContent = 'Ver horários livres';
  ok.onclick = async () => {
    if (!inp.value) { say('Escolha uma data.'); return; }
    const d = new Date(inp.value + 'T12:00:00');
    if (d.getDay() === 0) { say('Domingo fechado. Escolha outro dia.'); return; }
    state.date = inp.value;
    say(inp.value.split('-').reverse().join('/'), 'user');
    await showSlots();
  };
  panel.append(inp, ok);
}

function dayRangeISO(dateStr) {
  const start = new Date(dateStr + 'T00:00:00');
  const end = new Date(dateStr + 'T23:59:59');
  return { start: start.toISOString(), end: end.toISOString() };
}

async function showSlots() {
  state.step = 'slot';
  say('Buscando horários livres...');
  clearPanel();
  let booked = [];
  try {
    const { start, end } = dayRangeISO(state.date);
    booked = await sb(`appointments?select=starts_at,ends_at&status=neq.cancelado&starts_at=gte.${start}&starts_at=lte.${end}`);
  } catch (e) { booked = []; }

  const slots = [];
  for (let m = OPEN_START; m + SLOT <= OPEN_END; m += SLOT) {
    const h = String(Math.floor(m / 60)).padStart(2, '0');
    const mi = String(m % 60).padStart(2, '0');
    slots.push(`${h}:${mi}`);
  }

  const bookedRanges = booked.map(b => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
  const need = Math.ceil(state.duration / SLOT) * SLOT; // ex: 70min -> ocupa 90min
  const now = Date.now();

  slots.forEach(t => {
    const s = new Date(`${state.date}T${t}:00`).getTime();
    const e = s + need * 60000;
    const dayEnd = new Date(`${state.date}T19:30:00`).getTime();
    let busy = e > dayEnd || s < now - 60000;
    if (!busy) busy = bookedRanges.some(([bs, be]) => s < be && e > bs);
    const b = document.createElement('button');
    b.className = 'slot' + (busy ? ' busy' : '');
    b.textContent = t;
    if (!busy) b.onclick = () => confirmSlot(t);
    panel.appendChild(b);
  });
  say('Toque num horário livre:');
}

function confirmSlot(t) {
  state.slot = t;
  state.step = 'confirm';
  say(t, 'user');
  const names = state.services.map(s => s.name).join(' + ');
  say(`${state.name}, confirmar?\n${names}\n${state.date.split('-').reverse().join('/')} às ${t}\nTotal: ${fmt(state.total)}`);
  clearPanel();
  const ok = document.createElement('button');
  ok.className = 'primary';
  ok.textContent = `Confirmar — ${fmt(state.total)}`;
  ok.onclick = saveBooking;
  const back = document.createElement('button');
  back.className = 'slot';
  back.textContent = 'Trocar horário';
  back.onclick = showSlots;
  panel.append(ok, back);
}

async function saveBooking() {
  say('Confirmado', 'user');
  say('Salvando...');
  clearPanel();
  try {
    const starts = new Date(`${state.date}T${state.slot}:00`);
    const ends = new Date(starts.getTime() + state.duration * 60000);
    const [appt] = await sb('appointments', {
      method: 'POST',
      body: JSON.stringify([{
        customer_name: state.name,
        phone: state.phone,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        total: state.total,
        status: 'confirmado'
      }])
    });
    // itens (soma registrada por serviço)
    const items = state.services
      .filter(s => String(s.id).length > 20) // só UUIDs reais do Supabase
      .map(s => ({ appointment_id: appt.id, service_id: s.id, price_at_booking: s.price }));
    if (items.length) await sb('appointment_services', { method: 'POST', body: JSON.stringify(items) });
    say(`Pronto, ${state.name}! ✅\n${state.date.split('-').reverse().join('/')} às ${state.slot}\nTotal ${fmt(state.total)}. Até lá!`);
  } catch (e) {
    say('Erro ao salvar. Tente outro horário ou fale com a barbearia.');
  }
  state.step = 'done';
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const t = input.value.trim();
  if (!t) return;
  say(t, 'user');
  input.value = '';
  if (state.step === 'name') {
    state.name = t;
    state.step = 'phone';
    say(`Oi, ${t}! Qual seu telefone/WhatsApp?`);
  } else if (state.step === 'phone') {
    state.phone = t;
    askServices();
  } else {
    say('Use os botões acima pra continuar. 👆');
  }
});

(async () => {
  await loadServices();
  say('Olá! Vou te ajudar a agendar. 💈');
  say('Qual seu nome?');
})();
