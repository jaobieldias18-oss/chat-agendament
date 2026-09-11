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

// IA via Edge Function (GROQ_API_KEY fica só no servidor)
const chatHistory = [];

// Valida o nome com a IA: saudação sem nome não é aceita como nome
async function checkName(text) {
  const el = document.createElement('div');
  el.className = 'bot';
  el.textContent = 'Digitando...';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/chat', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: text, task: 'name_check' })
    });
    const data = await r.json();
    el.remove();
    if (data.name) {
      state.name = data.name;
      state.step = 'phone';
      say(data.reply || `Oi, ${data.name}! Qual seu telefone/WhatsApp?`);
      chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: data.reply || '' });
    } else {
      say(data.reply || 'Oi! Tudo bem? Qual é o seu nome?');
    }
  } catch (e) {
    el.remove();
    // sem IA: aceita como nome (comportamento antigo)
    state.name = text;
    state.step = 'phone';
    say(`Oi, ${text}! Qual seu telefone/WhatsApp?`);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
async function askGroq(text) {
  const el = document.createElement('div');
  el.className = 'bot';
  el.textContent = 'Digitando...';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/chat', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: text, history: chatHistory.slice(-8) })
    });
    const data = await r.json();
    el.textContent = data.reply || data.error || 'Tive um problema. Tente de novo.';
    chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: el.textContent });
  } catch (e) {
    el.textContent = 'Sem conexão com a IA agora. Use os botões acima. 👆';
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadServices() {
  try {
    state.allServices = await sb('services?select=*&active=eq.true&order=name');
  } catch (e) {
    // fallback local se o SQL ainda não foi rodado
    state.allServices = [
      { id: 'cabelo', name: 'Corte de cabelo', price: 30, duration_min: 30 },
      { id: 'barba', name: 'Barba', price: 20, duration_min: 15 },
      { id: 'sobrancelha', name: 'Sobrancelha', price: 10, duration_min: 5 }
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
  say('Escolha o dia:');
  clearPanel();
  const DOW = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const sunday = d.getDay() === 0;
    const b = document.createElement('button');
    b.className = 'day' + (sunday ? ' closed' : '');
    b.style.animationDelay = (i * 0.04) + 's';
    const sp = document.createElement('span'); sp.textContent = i === 0 ? 'HOJE' : DOW[d.getDay()];
    const nb = document.createElement('b'); nb.textContent = d.getDate();
    const sm = document.createElement('small'); sm.textContent = MON[d.getMonth()];
    b.append(sp, nb, sm);
    if (sunday) {
      b.title = 'Fechado aos domingos';
    } else {
      b.onclick = () => {
        state.date = iso;
        say(d.getDate() + '/' + (d.getMonth() + 1), 'user');
        showSlots();
      };
    }
    panel.appendChild(b);
  }
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
  // 1. Tenta o cálculo NO BANCO (lê a tabela appointments via rpc/free_slots)
  let free = null;
  try {
    const r = await sb('rpc/free_slots', {
      method: 'POST',
      body: JSON.stringify({ p_day: state.date, p_duration_min: state.duration })
    });
    if (Array.isArray(r)) free = r.map(x => x.slot);
  } catch (e) { free = null; }

  // 2. Fallback local (mesma regra) se o SQL novo ainda não foi rodado
  let booked = [];
  if (!free) {
    try {
      const { start, end } = dayRangeISO(state.date);
      booked = await sb(`appointments?select=starts_at,ends_at&status=neq.cancelado&starts_at=gte.${start}&starts_at=lte.${end}`);
    } catch (e) { booked = []; }
  }

  const slots = [];
  for (let m = OPEN_START; m + SLOT <= OPEN_END; m += SLOT) {
    const h = String(Math.floor(m / 60)).padStart(2, '0');
    const mi = String(m % 60).padStart(2, '0');
    slots.push(`${h}:${mi}`);
  }

  const bookedRanges = booked.map(b => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
  const need = Math.ceil(state.duration / SLOT) * SLOT; // ex: 70min -> ocupa 90min
  const now = Date.now();

  // Só mostra os LIVRES: horário ocupado some da lista
  // (o agendamento salvo grava início+fim, então outro cliente nunca vê o mesmo horário)
  let avail;
  if (free) {
    avail = free;
  } else {
    avail = slots.filter(t => {
      const s = new Date(`${state.date}T${t}:00`).getTime();
      const e = s + need * 60000;
      const dayEnd = new Date(`${state.date}T19:30:00`).getTime();
      if (e > dayEnd || s < now - 60000) return false;
      return !bookedRanges.some(([bs, be]) => s < be && e > bs);
    });
  }
  if (!avail.length) {
    say('Esse dia lotou. Escolha outra data. 📅');
    const back = document.createElement('button');
    back.className = 'primary';
    back.textContent = 'Escolher outra data';
    back.onclick = askDate;
    panel.appendChild(back);
    return;
  }
  avail.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'slot pop';
    b.style.animationDelay = (i * 0.03) + 's';
    b.textContent = t;
    b.onclick = () => confirmSlot(t);
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
    checkName(t);
  } else if (state.step === 'phone') {
    const digits = t.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      say('Esse número parece incompleto. Manda seu WhatsApp com DDD, só números. 📱');
    } else {
      state.phone = t;
      askServices();
    }
  } else {
    askGroq(t); // fora de nome/telefone, a IA responde; o agendamento segue pelos botões
  }
});

(async () => {
  await loadServices();
  say('Olá! Vou te ajudar a agendar. 💈');
  say('Qual seu nome?');
})();
